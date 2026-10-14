import { connectToDatabase } from "@/app/lib/db";
import Maintenance from "@/app/models/Maintenance";
import { sweepStaleExternalJobs, type SweepResult } from "@/app/lib/staleJobsSweep";

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 שעות
// A held lock older than this is considered stale (crashed/frozen run) and may
// be taken over, so a lost run can't deadlock cleanup forever.
const LOCK_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Run the stale-jobs sweep if it hasn't run in the last 24h, under a Mongo
 * lock. The sweep is awaited: on Vercel a detached promise is frozen with the
 * lambda, which left the lock held and the sweep half-done. Returns whether
 * this call did the work (and its report).
 */
export async function maybeRunExternalJobsCleanup(): Promise<{ triggered: boolean; report: SweepResult | null }> {
  await connectToDatabase();

  const key = "externalJobsCleanup";
  const now = Date.now();
  const threshold = new Date(now - INTERVAL_MS);
  const staleLock = new Date(now - LOCK_TTL_MS);

  let locked: any;
  try {
    locked = await Maintenance.findOneAndUpdate(
      {
        _id: key,
        // Acquire when not running, OR when a held lock has gone stale.
        $and: [
          {
            $or: [
              { running: { $ne: true } },
              { running: true, updatedAt: { $lt: staleLock } },
            ],
          },
          {
            $or: [
              { lastRunAt: { $lt: threshold } },
              { lastRunAt: { $exists: false } },
            ],
          },
        ],
      },
      {
        $set: { running: true },
        $setOnInsert: { lastRunAt: new Date(0) }, // רק בזמן יצירה ראשונית
      },
      { upsert: true, new: true }
    );
  } catch (err: any) {
    // טיפול ב־duplicate key במקביל (race condition)
    if (err.code === 11000) {
      console.warn("⚠️ Cleanup already locked by another process, skipping.");
      return { triggered: false, report: null };
    }
    throw err;
  }

  // אם לא ננעל → אין מה להריץ
  if (!locked || locked.running !== true) {
    return { triggered: false, report: null };
  }

  try {
    const report = await sweepStaleExternalJobs();
    await Maintenance.updateOne({ _id: key }, { $set: { lastRunAt: new Date(), running: false } });
    return { triggered: true, report };
  } catch (e) {
    console.error("❌ Cleanup agent failed:", e);
    // משחררים נעילה גם במקרה של כישלון
    await Maintenance.updateOne({ _id: key }, { $set: { running: false } });
    throw e;
  }
}
