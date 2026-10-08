import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs from "@/app/models/ExternalJobs";
import Candidates from "@/app/models/Candidates";

/**
 * Backstop freshness sweep for ATS-sourced jobs.
 *
 * The Scout reconciles each company's board on every poll (runScout): a job
 * that drops out of a complete ATS feed is deleted on the spot, and every job
 * still in the feed has its `lastSeenAt` refreshed. This sweep is the safety net
 * for the cases live reconciliation can't cover:
 *   - paginated/capped adapters (Workday) whose feed may be partial,
 *   - sources that stopped polling (rotated token, dead board, disabled source).
 *
 * Any ATS job not seen in `staleDays` is considered gone and removed, along with
 * its application records. It touches no network and makes no LLM calls — it is
 * a single indexed delete — so it is cheap enough to run often.
 *
 * CSV/manual jobs (no `sourceJobId`) are never swept; they aren't ATS-managed.
 */
const DEFAULT_STALE_DAYS = 14;

export type SweepResult = {
  staleDays: number;
  cutoff: string;
  deleted: number;
  applicationsDeleted: number;
};

export async function sweepStaleExternalJobs(
  staleDays: number = DEFAULT_STALE_DAYS
): Promise<SweepResult> {
  await connectToDatabase();

  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

  // Only ATS-managed postings (those carry a stable sourceJobId) whose most
  // recent sighting predates the cutoff. Missing lastSeenAt falls back to the
  // ingestion time so legacy docs are covered too.
  const filter = {
    sourceJobId: { $type: "string" },
    $or: [
      { lastSeenAt: { $lt: cutoff } },
      { lastSeenAt: { $exists: false }, firstSeenAt: { $lt: cutoff } },
      { lastSeenAt: { $exists: false }, firstSeenAt: { $exists: false }, createdAt: { $lt: cutoff } },
    ],
  };

  const stale = await ExternalJobs.find(filter).select("_id");
  const ids = stale.map((s: any) => s._id);

  if (ids.length === 0) {
    return {
      staleDays,
      cutoff: cutoff.toISOString(),
      deleted: 0,
      applicationsDeleted: 0,
    };
  }

  await ExternalJobs.deleteMany({ _id: { $in: ids } });
  const apps = await Candidates.deleteMany({
    jobModel: "ExternalJobs",
    jobId: { $in: ids },
  });

  const result: SweepResult = {
    staleDays,
    cutoff: cutoff.toISOString(),
    deleted: ids.length,
    applicationsDeleted: apps?.deletedCount ?? 0,
  };
  console.log("🧹 Stale external-jobs sweep:", result);
  return result;
}
