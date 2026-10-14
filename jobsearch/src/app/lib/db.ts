import mongoose from "mongoose";

/**
 * Cached connection for Next.js (survives hot-reload via globalThis). We key off
 * the live connection state rather than a boolean that latches forever, so a
 * dropped connection reconnects instead of short-circuiting on a dead socket.
 * A cached in-flight promise de-dupes concurrent first-time callers.
 *
 * Serverless sizing: every warm lambda holds its own pool, so a small pool per
 * instance keeps the Atlas connection count sane. Buffering is off so a query
 * issued before `await connectToDatabase()` fails loudly instead of hanging
 * until the lambda is frozen.
 */
type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
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

export async function connectToDatabase() {
  // 1 = connected. If we're already connected, reuse it.
  if (mongoose.connection.readyState === 1 && cache.conn) {
    return cache.conn;
  }

  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || "";
  if (!MONGO_URI) {
    throw new Error("Please define the MONGO_URI environment variable");
  }

  // A cached promise whose connection has since dropped (0 = disconnected,
  // 3 = disconnecting) is dead: forget it so we reconnect instead of handing
  // back a mongoose instance with a closed socket. 2 = connecting → reuse.
  if (cache.promise && mongoose.connection.readyState !== 2) {
    cache.promise = null;
    cache.conn = null;
  }

  // Reuse an in-flight connect; otherwise start one.
  if (!cache.promise) {
    cache.promise = mongoose
      .connect(MONGO_URI, CONNECT_OPTIONS)
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
