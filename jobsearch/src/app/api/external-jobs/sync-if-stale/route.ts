import { NextResponse,NextRequest } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs from "@/app/models/ExternalJobs";
import fetchSheetAsJson, { normalizeExternalJobs } from "@/app/components/OutsideJobs";
import { getFinalUrl } from "@/app/lib/crawler/finalUrl"; // מחזיר OpenJobResponse
import { agentSplitJobText } from "@/app/lib/agentJobSplitter";




export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("cron_secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    
    await connectToDatabase();
    console.log("got here:api/external-jobs/sync-if-stale");

    // 1) משיכת המשרות מהמקור
    const raw = await fetchSheetAsJson();
    const jobs = normalizeExternalJobs(raw);
    const urls = jobs.map((j) => j.url);

    // 2) בדיקת קיימים
    const existing = await ExternalJobs.find({ url: { $in: urls } }).select("url");
    const existingUrls = new Set(existing.map((j) => j.url));

    // 3) חדשים בלבד
    const newJobs = jobs.filter((j) => !existingUrls.has(j.url));
    console.log(`newJobs:`,newJobs)
    let createdCount = 0;
    console.log("DEBUG: finished parse");
    // 4) יצירה
    for (const job of newJobs) {
      try {
        const { finalUrl , jobdescription  } = await getFinalUrl(job.url);
        if(finalUrl){
            const split = await agentSplitJobText(jobdescription ?? "");
            console.log("SPLIT:", {
              company: split.companyDescription,
              jobDescription: split.jobDescription,
              qualifications: split.qualifications,
              prefered_qualifications: split.prefered_qualifications,
            });
            await ExternalJobs.create({
              ...job,
              // אם הסכמה דורשת finalUrl חובה, אפשר לגבות לכתובת המקור במקרה שלא נמצא
              finalUrl: finalUrl,
              company_description:split.companyDescription,
              description: split.jobDescription,
              skills:split.qualifications,
              prefered_qualifications: split.prefered_qualifications 
            });

            createdCount++;
        }
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
