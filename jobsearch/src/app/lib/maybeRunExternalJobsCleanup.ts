import { connectToDatabase } from "@/app/lib/db";
import Maintenance from "@/app/models/Maintenance";
import { AIJobCleanupAgent } from "@/app/lib/AIJobCleanupAgent";

const INTERVAL_MS = 48 * 60 * 60 * 1000; // 48 שעות

export async function maybeRunExternalJobsCleanup() {
  await connectToDatabase();

  const key = "externalJobsCleanup";
  const now = Date.now();
  const threshold = new Date(now - INTERVAL_MS);

  let locked: any;
  try {
    locked = await Maintenance.findOneAndUpdate(
      {
        _id: key,
        running: { $ne: true },
        $or: [
          { lastRunAt: { $lt: threshold } },
          { lastRunAt: { $exists: false } },
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
      const agent = new AIJobCleanupAgent();
      await agent.run();

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
