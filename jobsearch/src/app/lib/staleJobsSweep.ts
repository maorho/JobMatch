import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs, { OPEN_JOBS } from "@/app/models/ExternalJobs";

/**
 * Backstop freshness sweep for ATS-sourced jobs.
 *
 * The Scout reconciles each company's board on every poll (runScout): a job
 * that drops out of a complete ATS feed is soft-closed on the spot, and every
 * job still in the feed has its `lastSeenAt` refreshed. This sweep is the
 * safety net for the cases live reconciliation can't cover:
 *   - paginated/capped adapters (Workday) whose feed may be partial,
 *   - sources that stopped polling (rotated token, dead board, disabled source).
 *
 * Any open ATS job not seen in `staleDays` is soft-closed (active:false,
 * closedAt) — never deleted: the person's applications, saved list and the
 * job page keep resolving it. It touches no network and makes no LLM calls —
 * a single indexed update — so it is cheap enough to run often.
 *
 * CSV/manual jobs (no `sourceJobId`) are never swept; they aren't ATS-managed.
 */
const DEFAULT_STALE_DAYS = 14;

export type SweepResult = {
  staleDays: number;
  cutoff: string;
  /** Postings soft-closed by this run. */
  closed: number;
  /** Kept for callers that read the old shape; nothing is deleted any more. */
  deleted: 0;
  applicationsDeleted: 0;
};

export async function sweepStaleExternalJobs(
  staleDays: number = DEFAULT_STALE_DAYS
): Promise<SweepResult> {
  await connectToDatabase();

  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

  // Only open, ATS-managed postings (those carry a stable sourceJobId) whose
  // most recent sighting predates the cutoff. Missing lastSeenAt falls back to
  // the ingestion time so legacy docs are covered too.
  const filter = {
    ...OPEN_JOBS,
    sourceJobId: { $type: "string" },
    $or: [
      { lastSeenAt: { $lt: cutoff } },
      { lastSeenAt: { $exists: false }, firstSeenAt: { $lt: cutoff } },
      { lastSeenAt: { $exists: false }, firstSeenAt: { $exists: false }, createdAt: { $lt: cutoff } },
    ],
  };

  const r = await ExternalJobs.updateMany(filter, { $set: { active: false, closedAt: new Date() } });

  const result: SweepResult = {
    staleDays,
    cutoff: cutoff.toISOString(),
    closed: r.modifiedCount ?? 0,
    deleted: 0,
    applicationsDeleted: 0,
  };
  if (result.closed) console.log("🧹 Stale external-jobs sweep:", result);
  return result;
}
