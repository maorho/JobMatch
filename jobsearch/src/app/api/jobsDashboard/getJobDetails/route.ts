import { connectToDatabase } from "@/app/lib/db";
import Job from "@/app/models/Job";
import Company from "@/app/models/Company";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");

    if (!jobId || !mongoose.Types.ObjectId.isValid(jobId)) {
      return NextResponse.json({ message: "Invalid or missing jobId" }, { status: 400 });
    }

    const job = await Job.findById(jobId)
      .populate({
        path: "company",
        model: "Company",
        select: "companyName",
      })
      .lean();

    if (!job) {
      return NextResponse.json({ message: "Job not found" }, { status: 404 });
    }

    return NextResponse.json(job);
  } catch (error) {
    console.error("Error fetching job details:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
