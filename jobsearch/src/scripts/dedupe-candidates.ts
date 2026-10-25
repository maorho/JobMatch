/**
 * One-off, idempotent: remove duplicate applications so the unique index
 * { candidateId: 1, jobId: 1 } on Candidates can build. Per (candidateId,
 * jobId) it keeps the row with the furthest status (tie → the one an
 * ApplicationOutcome points at → oldest), re-points ApplicationOutcome /
 * ApplicationEvent / ReferralRequest / InterviewQuestion references from the
 * dropped rows to the keeper, then deletes the rest. Logic lives in
 * lib/ops/dedupeCandidates.ts. `--dry` only prints the plan.
 *
 *   npx tsx src/scripts/dedupe-candidates.ts [--dry]
 *
 * Reads MONGO_URI from .env.local (dotenv). Run it BEFORE the sync-indexes
 * route / syncIndexes(), then run src/scripts/backfill-embedded-at.ts.
 */
import path from "node:path";
import { config } from "dotenv";
import mongoose from "mongoose";
import { dedupeCandidates } from "../app/lib/ops/dedupeCandidates";

config({ path: path.resolve(process.cwd(), ".env.local") });
config();

const DRY = process.argv.includes("--dry");

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGO_URI is not set (.env.local)");
  await mongoose.connect(uri, { bufferCommands: false, maxPoolSize: 2 });
  const db = mongoose.connection.db!;

  const r = await dedupeCandidates(db, { dry: DRY });
  console.log(`candidates: ${await db.collection("candidates").estimatedDocumentCount()} rows, ${r.groups} duplicated (candidateId, jobId) pairs, ${r.rowsToDelete} rows to delete`);
  // The plan, so a dry run shows exactly which row survives each group.
  for (const p of r.plans.slice(0, 200)) console.log(`  candidate ${p.candidateId} job ${p.jobId}: keep ${p.keep}, drop ${p.drop.join(", ")}`);
  if (r.plans.length > 200) console.log(`  … and ${r.plans.length - 200} more groups`);
  if (DRY) {
    console.log("dry run: nothing changed");
  } else {
    console.log(
      `deleted ${r.deleted} duplicate rows; outcomes re-pointed ${r.outcomesRepointed} / deleted ${r.outcomesDeleted}; events re-pointed ${r.eventsRepointed}; referrals re-pointed ${r.referralsRepointed}; questions re-pointed ${r.questionsRepointed} / deleted ${r.questionsDeleted}`
    );
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
