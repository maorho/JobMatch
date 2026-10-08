import mongoose from "mongoose";

/**
 * Cached connection for Next.js (survives hot-reload via globalThis). We key off
 * the live connection state rather than a boolean that latches forever, so a
 * dropped connection reconnects instead of short-circuiting on a dead socket.
 * A cached in-flight promise de-dupes concurrent first-time callers.
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

export async function connectToDatabase() {
  // 1 = connected. If we're already connected, reuse it.
  if (mongoose.connection.readyState === 1 && cache.conn) {
    return cache.conn;
  }

  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || "";
  if (!MONGO_URI) {
    throw new Error("Please define the MONGO_URI environment variable");
  }

  // Reuse an in-flight connect; otherwise start one.
  if (!cache.promise) {
    cache.promise = mongoose
      .connect(MONGO_URI)
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
