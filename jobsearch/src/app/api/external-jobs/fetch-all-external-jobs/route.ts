import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs from "@/app/models/ExternalJobs";
import { NextRequest, NextResponse } from "next/server";

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

    const [jobs, total] = await Promise.all([
      // Sort by real posting date (interleaves companies); fall back to
      // ingestion time for older docs that have no postedAt.
      ExternalJobs.find()
        .sort({ postedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ExternalJobs.countDocuments()
    ]);
    
    const jobsWithSource = jobs.map((job) => ({
      ...job.toObject(),
      source: "external",
    }));

    return NextResponse.json({
      jobs: jobsWithSource,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("❌ Error fetching jobs:", error);
    return NextResponse.json(
      { message: "Failed to fetch external jobs" },
      { status: 500 }
    );
  }
}
