// /api/external-jobs/sync-if-stale/route.ts
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs from "@/app/models/ExternalJobs";
import fetchSheetAsJson, { normalizeExternalJobs } from "@/app/components/OutsideJobs";
import { getFinalUrl } from "@/app/lib/crawler/finalUrl";

const MAX_HOURS = 12;

export async function GET() {
  try {
    await connectToDatabase();
    console.log("got here:api/external-jobs/sync-if-stale")
    // 1. בדיקת זמן עדכון אחרון
    const last = await ExternalJobs.findOne().sort({ updatedAt: -1 });
    const now = new Date();
    if (last) {
      const diffHours = (now.getTime() - new Date(last.updatedAt).getTime()) / (1000 * 60 * 60);
      if (diffHours < MAX_HOURS) {
        return NextResponse.json({ message: "External jobs are up to date." });
      }
    }

    // 2. קבלת כל המשרות מה-CSV
    const raw = await fetchSheetAsJson();
    const jobs = normalizeExternalJobs(raw);
    const urls = jobs.map(j => j.url);

    // 3. שליפת משרות קיימות
    const existing = await ExternalJobs.find({ url: { $in: urls } }).select("url");
    const existingUrls = new Set(existing.map(j => j.url));

    // 4. סינון משרות חדשות בלבד
    const newJobs = jobs.filter(j => !existingUrls.has(j.url));

    let createdCount = 0;

    // 5. עבור כל משרה חדשה — השג finalUrl ושמור ל-DB
    for (const job of newJobs) {
      try {
        const finalUrl = await getFinalUrl(job.url);
        console.log(`job:${job}`);
        console.log(`finalurl:${finalUrl}`);
        await ExternalJobs.create({
          ...job,
          finalUrl,
          description: "",
        });
        createdCount++;
      } catch (err) {
        console.error("Failed to crawl:", job.url, err);
      }
    }

    return NextResponse.json({ message: `Sync complete. ${createdCount} new jobs added.` });
  } catch (err) {
    console.error("❌ Sync error:", err);
    return NextResponse.json({ message: "Failed to sync external jobs." }, { status: 500 });
  }
}

