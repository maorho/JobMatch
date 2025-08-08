import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs from "@/app/models/ExternalJobs";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    const alljobs = await ExternalJobs.find().sort({ createdAt: -1 });

    const jobsWithSource = alljobs.map((job) => ({
      ...job.toObject(),
      source: "external",
    }));

    return NextResponse.json(jobsWithSource);
  } catch (error) {
    console.error("❌ Error fetching jobs:", error);
    return NextResponse.json(
      { message: "Failed to fetch external jobs" },
      { status: 500 }
    );
  }
}
