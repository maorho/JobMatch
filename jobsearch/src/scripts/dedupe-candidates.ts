/**
 * One-off, idempotent: remove duplicate applications so the unique index
 * { candidateId: 1, jobId: 1 } on Candidates can build. Keeps the OLDEST row
 * per (candidateId, jobId) — it is the one ApplicationOutcome / events point
 * at — and deletes the rest. Prints counts; `--dry` only prints.
 *
 *   npx tsx src/scripts/dedupe-candidates.ts [--dry]
 *
 * Reads MONGO_URI from .env.local (dotenv). Run it BEFORE the sync-indexes
 * route / syncIndexes(), then run src/scripts/backfill-embedded-at.ts.
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
  const col = mongoose.connection.db!.collection("candidates");

  // Groups with more than one row, oldest first so ids[0] is the keeper.
  const groups = (await col
    .aggregate([
      { $sort: { createdAt: 1, _id: 1 } },
      { $group: { _id: { candidateId: "$candidateId", jobId: "$jobId" }, ids: { $push: "$_id" }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ])
    .toArray()) as { _id: { candidateId: unknown; jobId: unknown }; ids: mongoose.Types.ObjectId[]; n: number }[];

  const toDelete = groups.flatMap((g) => g.ids.slice(1));
  console.log(`candidates: ${await col.estimatedDocumentCount()} rows, ${groups.length} duplicated (candidateId, jobId) pairs, ${toDelete.length} rows to delete`);
  if (!DRY && toDelete.length) {
    // Batches: a single $in with tens of thousands of ids is fine for Mongo but not for the oplog readers.
    let deleted = 0;
    for (let i = 0; i < toDelete.length; i += 1000) {
      const r = await col.deleteMany({ _id: { $in: toDelete.slice(i, i + 1000) } });
      deleted += r.deletedCount ?? 0;
    }
    console.log(`deleted ${deleted} duplicate rows`);
  } else if (DRY) {
    console.log("dry run: nothing deleted");
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
