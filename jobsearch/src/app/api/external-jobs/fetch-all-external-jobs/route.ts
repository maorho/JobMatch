import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs from "@/app/models/ExternalJobs";
import { NextRequest, NextResponse } from "next/server";
import { memo, snippet, ttl, PUBLIC_CACHE } from "@/app/lib/cache";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    const { searchParams } = new URL(req.url);
    const rawPage = parseInt(searchParams.get("page") || "1", 10);
    const rawLimit = parseInt(searchParams.get("limit") || "50", 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50;
    const skip = (page - 1) * limit;

    // Public, identical for everyone: cached per page for a minute (in-process + CDN).
    const payload = await memo(`external-jobs:${page}:${limit}`, ttl(60_000), async () => {
      const [jobs, total] = await Promise.all([
        // Sort by real posting date (interleaves companies); fall back to
        // ingestion time for older docs that have no postedAt. `_id` breaks the
        // (frequent) ties so skip/limit paging never repeats a job.
        ExternalJobs.find().sort({ postedAt: -1, createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
        ExternalJobs.countDocuments(),
      ]);
      return { jobs: jobs.map((job: any) => ({ ...job, description: snippet(job.description), source: "external" })), total, page, pages: Math.ceil(total / limit) };
    });
    return NextResponse.json(payload, { headers: PUBLIC_CACHE });
  } catch (error) {
    console.error("❌ Error fetching jobs:", error);
    return NextResponse.json(
      { message: "Failed to fetch external jobs" },
      { status: 500 }
    );
  }
}
