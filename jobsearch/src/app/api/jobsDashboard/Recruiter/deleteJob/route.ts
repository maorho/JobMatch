import { connectToDatabase } from "@/app/lib/db";
import Job from "@/app/models/Job";
import Candidates from "@/app/models/Candidates";
import { NextRequest, NextResponse } from "next/server";
import { AppJwtPayload, verifyJwt } from "@/app/lib/jwt";

export async function DELETE(req: NextRequest) {
  await connectToDatabase();

  const token = req.cookies.get("token")?.value;

  if (!token) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  let decoded;
  try {
    decoded = await verifyJwt<AppJwtPayload>(token);
  } catch {
    return NextResponse.json({ message: "Invalid or expired token" }, { status: 401 });
  }

  if (!decoded) {
    return NextResponse.json({ message: "Invalid or expired token" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ message: "Missing jobId" }, { status: 400 });
  }

  const job = await Job.findById(jobId);
  if (!job) {
    return NextResponse.json({ message: "Job not found" }, { status: 404 });
  }
  if (job.publisher.toString() !== decoded.id && !decoded.admin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }

  await Job.findByIdAndDelete(jobId);
  await Candidates.deleteMany({ jobId });

  return NextResponse.json({ message: "Job and related candidates deleted successfully" });
}
