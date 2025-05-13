import { connectToDatabase } from "@/app/lib/db";
import Job from "@/app/models/Job";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  await connectToDatabase();

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ message: "Missing jobId" }, { status: 400 });
  }

  try {
    const job = await Job.findById(jobId).lean();

    if (!job) {
      return NextResponse.json({ message: "Job not found" }, { status: 404 });
    }

    return NextResponse.json(job);
  } catch (err) {
    return NextResponse.json({ message: "Invalid jobId format" }, { status: 400 });
  }
}
