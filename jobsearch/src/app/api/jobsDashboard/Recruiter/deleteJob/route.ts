import { connectToDatabase } from "@/app/lib/db";
import Job from "@/app/models/Job";
import Candidates from "@/app/models/Candidates";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireRecruiterOrAdmin, recruiterDenied } from "@/app/lib/authGuard";

export async function DELETE(req: NextRequest) {
  // Role comes from the database, not from the token's claims.
  const auth = await requireRecruiterOrAdmin(req);
  if (!auth) return recruiterDenied(req);
  await connectToDatabase();

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (!jobId || !mongoose.isValidObjectId(jobId)) {
    return NextResponse.json({ message: "Missing jobId" }, { status: 400 });
  }

  const job = await Job.findById(jobId);
  if (!job) {
    return NextResponse.json({ message: "Job not found" }, { status: 404 });
  }
  if (String(job.publisher) !== auth.id && !auth.admin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }

  await Job.findByIdAndDelete(jobId);
  await Candidates.deleteMany({ jobId });

  return NextResponse.json({ message: "Job and related candidates deleted successfully" });
}
