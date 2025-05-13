// /app/api/candidates/update-status/route.ts

import { connectToDatabase } from "@/app/lib/db";
import Job from "@/app/models/Job";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest) {
  await connectToDatabase();

  const { jobId ,updatedFields} = await req.json();

  if (!jobId ||!updatedFields) {
    return NextResponse.json({ message: "Missing required fields" }, { status: 400 });
  }

  const updated = await Job.findOneAndUpdate(
    { _id: jobId },
    { $set: updatedFields },
    { new: true }
  );
  

  if (!updated) {
    return NextResponse.json({ message: "Job didn't updated succesfully" }, { status: 404 });
  }

  return NextResponse.json({
    message: "Job Details updated successfully",
    job: updated,
  });
}
