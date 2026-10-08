import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import { cosineSimilarity, toMatchScore } from "@/app/lib/matcher/cosine";
import { notify } from "./notify";

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

  // New, embedded postings once; filtered per user by their own cut-off.
  // Pick the ids first, sorted on the firstSeenAt index (a blocking sort over
  // documents that carry a 1536-float vector blows Mongo's 32MB sort limit);
  // allowDiskUse covers a deployment whose index hasn't been built yet.
  const recent: { _id: any }[] = await ExternalJobs.find({ firstSeenAt: { $gt: horizon }, embedding: { $exists: true } })
    .select("_id")
    .sort({ firstSeenAt: -1 })
    .limit(3000)
    .allowDiskUse(true)
    .lean();
  const jobs: any[] = recent.length
    ? await ExternalJobs.find({ _id: { $in: recent.map((r) => r._id) } })
        .select("+embedding job company city country firstSeenAt")
        .lean()
    : [];

  const users: any[] = await User.find({ embedding: { $exists: true, $ne: [] } })
    .select("+embedding lastMatchDigestAt")
    .limit(500)
    .lean();

  let notified = 0;
  for (const u of users) {
    const since = u.lastMatchDigestAt ? new Date(Math.max(new Date(u.lastMatchDigestAt).getTime(), horizon.getTime())) : horizon;
    const fresh = jobs.filter((j) => j.firstSeenAt && new Date(j.firstSeenAt) > since && Array.isArray(j.embedding));
    const scored = fresh
      .map((j) => ({ j, score: toMatchScore(cosineSimilarity(u.embedding, j.embedding)) }))
      .filter((x) => x.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_N);

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

  return { users: users.length, newJobs: jobs.length, notified, dry };
}
