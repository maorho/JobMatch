import { connectToDatabase } from "@/app/lib/db";
import Job from "@/app/models/Job";
import { requireRecruiterOrAdmin } from "@/app/lib/authGuard";
import { NextRequest, NextResponse } from "next/server";

// Only these fields may be edited — never publisher/company (prevents takeover).
const ALLOWED_FIELDS = [
  "job",
  "type",
  "city",
  "country",
  "link",
  "description",
  "qualifications",
] as const;

export async function PUT(req: NextRequest) {
  const auth = await requireRecruiterOrAdmin(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectToDatabase();

  const { jobId, updatedFields } = await req.json();
  if (!jobId || !updatedFields || typeof updatedFields !== "object") {
    return NextResponse.json(
      { message: "Missing required fields" },
      { status: 400 }
    );
  }

  const job = await Job.findById(jobId);
  if (!job) {
    return NextResponse.json({ message: "Job not found" }, { status: 404 });
  }
  // Ownership: the publishing recruiter (or an admin) may edit.
  if (!auth.admin && String(job.publisher) !== String(auth.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Whitelist the updatable fields.
  const safe: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in updatedFields) safe[key] = (updatedFields as any)[key];
  }
  if (Object.keys(safe).length === 0) {
    return NextResponse.json({ message: "No valid fields" }, { status: 400 });
  }

  const updated = await Job.findByIdAndUpdate(
    jobId,
    { $set: safe },
    { new: true }
  );

  return NextResponse.json({
    message: "Job Details updated successfully",
    job: updated,
  });
}
