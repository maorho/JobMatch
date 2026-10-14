import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import { notify } from "./notify";
import { rankJobs, loadCandidateProfile } from "@/app/lib/matcher/hybrid";
import { inferCandidateLevel } from "@/app/lib/matcher/level";

const MIN_SCORE = 60;
const TOP_N = 5;
const LOOKBACK_DAYS = 7;
/** A person hears from the digest at most once per this window, whatever the cron cadence. */
const MIN_HOURS_BETWEEN = 20;

export type DigestResult = { users: number; newJobs: number; notified: number; skippedRecent: number; minHours: number; dry: boolean };

/**
 * "New jobs that match you" digest. For every user with a résumé vector:
 * score the postings ingested since their last digest (bounded to the last
 * 7 days) and notify them once with the top matches above MIN_SCORE.
 * Idempotent per user via lastMatchDigestAt, which is only stamped when a
 * digest was actually sent — so a 30-minute scout cadence can never turn
 * into a notification storm, and a quiet day never "uses up" the window.
 */
export async function runJobMatchDigest(opts: { dry?: boolean } = {}): Promise<DigestResult> {
  const dry = !!opts.dry;
  await connectToDatabase();
  const now = new Date();
  const horizon = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 3600 * 1000);
  const recent = new Date(now.getTime() - MIN_HOURS_BETWEEN * 3600 * 1000);

  const newJobs = await ExternalJobs.countDocuments({ firstSeenAt: { $gt: horizon }, embeddedAt: { $exists: true }, active: { $ne: false } });
  const users: any[] = await User.find({ embedding: { $exists: true, $ne: [] } })
    .select("+embedding +resumeText lastMatchDigestAt level currentJob")
    .limit(500)
    .lean();

  let notified = 0;
  let skippedRecent = 0;
  for (const u of users) {
    if (u.lastMatchDigestAt && new Date(u.lastMatchDigestAt) > recent) {
      skippedRecent++;
      continue;
    }
    const since = u.lastMatchDigestAt ? new Date(Math.max(new Date(u.lastMatchDigestAt).getTime(), horizon.getTime())) : horizon;
    // Vector search scoped to the postings that are new for this user; level-aware score.
    const profile = (await loadCandidateProfile(String(u._id), { light: true }).catch(() => null)) || { vector: u.embedding, level: u.level || inferCandidateLevel(u.resumeText || "", u.currentJob || ""), resumeSummary: "", resumeVersion: 0 };
    const { jobs } = await rankJobs({ ...profile, userId: undefined, resumeSummary: "" }, { filter: { firstSeenAfter: since }, limit: TOP_N, minScore: MIN_SCORE, rerank: false });
    const scored = jobs.map((j) => ({ j, score: j.matchScore }));

    // No match above the bar → nothing to say, and the window is not consumed.
    if (!scored.length) continue;
    if (!dry) {
      await notify(String(u._id), {
        type: "job_match",
        title: scored.length === 1 ? "משרה חדשה שמתאימה לך" : `${scored.length} משרות חדשות שמתאימות לך`,
        body: scored.map((x) => `${x.j.job} · ${x.j.company} (${x.score}%)`).join("\n"),
        link: "/",
        meta: { jobIds: scored.map((x) => String(x.j._id)) },
      });
      await User.updateOne({ _id: u._id }, { $set: { lastMatchDigestAt: now } });
    }
    notified++;
  }

  return { users: users.length, newJobs, notified, skippedRecent, minHours: MIN_HOURS_BETWEEN, dry };
}
