import { connectToDatabase } from "@/app/lib/db";
import Maintenance from "@/app/models/Maintenance";
import { sweepStaleExternalJobs } from "@/app/lib/staleJobsSweep";

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 שעות
// A held lock older than this is considered stale (crashed/frozen run) and may
// be taken over, so a lost run can't deadlock cleanup forever.
const LOCK_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export async function maybeRunExternalJobsCleanup() {
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
      return false;
    }
    throw err;
  }

  // אם לא ננעל → אין מה להריץ
  if (!locked || locked.running !== true) {
    return false;
  }

  // מריצים ברקע כדי לא לחסום את ה־API
  (async () => {
    try {
      await sweepStaleExternalJobs();

      await Maintenance.updateOne(
        { _id: key },
        { $set: { lastRunAt: new Date(), running: false } }
      );

      console.log("✅ Cleanup finished successfully.");
    } catch (e) {
      console.error("❌ Cleanup agent failed:", e);
      // משחררים נעילה גם במקרה של כישלון
      await Maintenance.updateOne({ _id: key }, { $set: { running: false } });
    }
  })();

  return true;
}
