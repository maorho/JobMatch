import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import { notify } from "./notify";
import { rankJobs } from "@/app/lib/matcher/hybrid";
import { inferCandidateLevel } from "@/app/lib/matcher/level";

const MIN_SCORE = 60;
const TOP_N = 5;
const LOOKBACK_DAYS = 7;

export type DigestResult = { users: number; newJobs: number; notified: number; dry: boolean };

/**
 * "New jobs that match you" digest. For every user with a résumé vector:
 * score the postings ingested since their last digest (bounded to the last
 * 7 days) and notify them once with the top matches above MIN_SCORE.
 * Idempotent per user via lastMatchDigestAt.
 */
export async function runJobMatchDigest(opts: { dry?: boolean } = {}): Promise<DigestResult> {
  const dry = !!opts.dry;
  await connectToDatabase();
  const now = new Date();
  const horizon = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 3600 * 1000);

  const newJobs = await ExternalJobs.countDocuments({ firstSeenAt: { $gt: horizon }, embedding: { $exists: true } });
  const users: any[] = await User.find({ embedding: { $exists: true, $ne: [] } })
    .select("+embedding +resumeText lastMatchDigestAt level currentJob")
    .limit(500)
    .lean();

  let notified = 0;
  for (const u of users) {
    const since = u.lastMatchDigestAt ? new Date(Math.max(new Date(u.lastMatchDigestAt).getTime(), horizon.getTime())) : horizon;
    // Vector search scoped to the postings that are new for this user; level-aware score.
    const { jobs } = await rankJobs(
      { vector: u.embedding, level: u.level || inferCandidateLevel(u.resumeText || "", u.currentJob || ""), resumeSummary: "", resumeVersion: 0 },
      { filter: { firstSeenAfter: since }, limit: TOP_N, minScore: MIN_SCORE, rerank: false }
    );
    const scored = jobs.map((j) => ({ j, score: j.matchScore }));

    if (!dry) {
      if (scored.length) {
        await notify(String(u._id), {
          type: "job_match",
          title: scored.length === 1 ? "משרה חדשה שמתאימה לך" : `${scored.length} משרות חדשות שמתאימות לך`,
          body: scored.map((x) => `${x.j.job} · ${x.j.company} (${x.score}%)`).join("\n"),
          link: "/",
          meta: { jobIds: scored.map((x) => String(x.j._id)) },
        });
      }
      await User.updateOne({ _id: u._id }, { $set: { lastMatchDigestAt: now } });
    }
    if (scored.length) notified++;
  }

  return { users: users.length, newJobs, notified, dry };
}
