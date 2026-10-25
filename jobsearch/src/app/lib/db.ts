import mongoose from "mongoose";

/**
 * Cached connection for Next.js (survives hot-reload via globalThis). One
 * MongoClient per process: a transient drop is left to the driver's own
 * recovery, and only an explicit close (or a failed initial connect) leads to
 * a fresh connect(). A cached in-flight promise de-dupes concurrent callers.
 *
 * Serverless sizing: every warm lambda holds its own pool, so a small pool per
 * instance keeps the Atlas connection count sane. Buffering is off so a query
 * issued before `await connectToDatabase()` fails loudly instead of hanging
 * until the lambda is frozen.
 */
type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  /** The 'close' listener is registered once per process (survives hot-reload). */
  listening?: boolean;
};

const globalWithMongoose = globalThis as unknown as {
  _mongooseCache?: MongooseCache;
};

const cache: MongooseCache =
  globalWithMongoose._mongooseCache || { conn: null, promise: null };
globalWithMongoose._mongooseCache = cache;

// Indexes are created by `syncIndexes` (api/scout/sync-indexes) in production,
// never on cold start: an index build on a 40k-document collection is not
// something a request should wait for.
mongoose.set("autoIndex", process.env.NODE_ENV !== "production");

const CONNECT_OPTIONS: mongoose.ConnectOptions = {
  maxPoolSize: 5,
  minPoolSize: 0,
  bufferCommands: false,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

// 'close' fires only on an explicit close()/disconnect(), never on a transient
// drop (Atlas primary election → readyState 0 → 'disconnected'), so it is the
// one signal that the client is really gone and a new connect() is required.
if (!cache.listening) {
  cache.listening = true;
  mongoose.connection.on("close", () => {
    cache.conn = null;
    cache.promise = null;
  });
}

/** Wait up to `ms` for the driver to re-establish a dropped connection. */
function waitForReconnect(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      mongoose.connection.off("connected", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    mongoose.connection.once("connected", done);
  });
}

export async function connectToDatabase() {
  // 1 = connected. If we're already connected, reuse it.
  if (mongoose.connection.readyState === 1 && cache.conn) {
    return cache.conn;
  }

  // A client exists and was never closed, so it is only temporarily
  // disconnected: the driver reconnects on its own. Calling connect() again
  // here would build a second MongoClient and leak the first one's pool.
  // Give it up to serverSelectionTimeoutMS, then hand the connection back
  // anyway: queries go through driver server selection, which either finds
  // the new primary or fails with a clear error.
  if (cache.conn) {
    if (mongoose.connection.readyState !== 1) {
      await waitForReconnect(CONNECT_OPTIONS.serverSelectionTimeoutMS ?? 5000);
    }
    return cache.conn;
  }

  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || "";
  if (!MONGO_URI) {
    throw new Error("Please define the MONGO_URI environment variable");
  }

  // Reuse an in-flight connect; otherwise start one (first connect, or the
  // previous client was explicitly closed / its initial connect failed).
  if (!cache.promise) {
    cache.promise = (async () => {
      // A half-open client (e.g. disconnecting) must be torn down first, or
      // its pool leaks alongside the new one.
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => undefined);
      return mongoose.connect(MONGO_URI, CONNECT_OPTIONS);
    })()
      .then((m) => {
        console.log("MongoDB connected");
        return m;
      })
      .catch((error) => {
        // Clear so the next call retries instead of awaiting a rejected promise.
        cache.promise = null;
        console.error("Error connecting to MongoDB", error);
        throw error;
      });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}
