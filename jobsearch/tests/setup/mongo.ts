import { beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

/**
 * In-memory MongoDB for integration tests — the app keeps using Mongoose
 * exactly as in production; only the server it connects to is a throwaway
 * local process, so tests never touch the real cluster.
 *
 * Call `setupTestDb()` at the top of a test file: it boots the server before
 * the suite, points connectToDatabase() at it via MONGO_URI, syncs indexes,
 * and tears everything down after. `resetDb()` wipes collections between
 * tests (indexes are kept).
 */
let server: MongoMemoryServer | null = null;

export async function startTestDb(): Promise<string> {
  server = await MongoMemoryServer.create();
  const uri = server.getUri();
  process.env.MONGO_URI = uri;
  process.env.MONGODB_URI = uri;
  return uri;
}

export async function stopTestDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (server) {
    await server.stop();
    server = null;
  }
}

export async function resetDb(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;
  const collections = await db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

// Not a React hook — named without the `use` prefix so rules-of-hooks stays quiet.
export function setupTestDb() {
  beforeAll(async () => {
    await startTestDb();
    const { connectToDatabase } = await import("@/app/lib/db");
    await connectToDatabase();
    // Unique/partial indexes must exist before tests rely on dedup.
    const { default: ExternalJobs } = await import("@/app/models/ExternalJobs");
    await ExternalJobs.syncIndexes();
  });
  afterAll(async () => {
    await stopTestDb();
  });
}
