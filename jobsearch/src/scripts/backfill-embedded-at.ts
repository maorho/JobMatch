/**
 * One-off, idempotent: stamp `embeddedAt` on ExternalJobs embedded before the
 * marker existed, and `active:true` on legacy docs without the field. The
 * backfill query (lib/matcher/embedJobs.ts) and the health counts read these
 * indexed fields instead of `embedding: {$exists}` (a 1536-float array, no
 * usable index). `--dry` only prints.
 *
 *   npx tsx src/scripts/backfill-embedded-at.ts [--dry]
 */
import path from "node:path";
import { config } from "dotenv";
import mongoose from "mongoose";

config({ path: path.resolve(process.cwd(), ".env.local") });
config();

const DRY = process.argv.includes("--dry");

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGO_URI is not set (.env.local)");
  await mongoose.connect(uri, { bufferCommands: false, maxPoolSize: 2 });
  const col = mongoose.connection.db!.collection("externaljobs");

  const needStamp = { embedding: { $exists: true }, embeddedAt: { $exists: false } };
  const needActive = { active: { $exists: false } };
  console.log(`externaljobs: ${await col.countDocuments(needStamp)} embedded without embeddedAt, ${await col.countDocuments(needActive)} without active`);
  if (DRY) {
    console.log("dry run: nothing written");
  } else {
    // The embedding was written at the doc's last update at the latest; close enough for a marker.
    const s = await col.updateMany(needStamp, [{ $set: { embeddedAt: { $ifNull: ["$updatedAt", "$$NOW"] } } }]);
    const a = await col.updateMany(needActive, { $set: { active: true } });
    console.log(`stamped embeddedAt on ${s.modifiedCount}, set active:true on ${a.modifiedCount}`);
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
