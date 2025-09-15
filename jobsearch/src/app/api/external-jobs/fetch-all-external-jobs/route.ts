import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs from "@/app/models/ExternalJobs";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const skip = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      ExternalJobs.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
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
