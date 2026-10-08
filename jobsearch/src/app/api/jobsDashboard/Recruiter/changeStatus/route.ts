import { connectToDatabase } from "@/app/lib/db";
import Candidates from "@/app/models/Candidates";
import Job from "@/app/models/Job";
import { requireRecruiterOrAdmin } from "@/app/lib/authGuard";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireRecruiterOrAdmin(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await connectToDatabase();

    const { jobId, updateStatuses } = await req.json();

    if (!jobId || !updateStatuses || !mongoose.isValidObjectId(jobId)) {
      return NextResponse.json({ message: "Missing required fields" }, { status: 400 });
    }

    // Ownership: only the publishing recruiter (or an admin) may change statuses.
    const job = await Job.findById(jobId).select("publisher");
    if (!job) {
      return NextResponse.json({ message: "Job not found" }, { status: 404 });
    }
    if (!auth.admin && String(job.publisher) !== String(auth.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const statusMap = new Map<string, string>(Object.entries(updateStatuses));

    if (statusMap.size === 0) {
      return NextResponse.json({ message: "No updates to apply" }, { status: 200 });
    }

    const updates = Array.from(statusMap.entries())
      .filter(([userID]) => mongoose.isValidObjectId(userID))
      .map(([userID, status]) => {
      return {
        updateOne: {
          filter: {
            candidateId: new mongoose.Types.ObjectId(userID),
            jobId: new mongoose.Types.ObjectId(jobId),
          },
          update: { $set: { status } },
        },
      };
    });

    if (updates.length === 0) {
      return NextResponse.json({ message: "No valid updates" }, { status: 400 });
    }

    const result = await Candidates.bulkWrite(updates);

    console.log("Bulk write result:", result);

    return NextResponse.json({
      message: "Candidates status updated successfully",
      updated: result,
    });
  } catch (err) {
    console.error("Error updating candidate statuses:", err);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
