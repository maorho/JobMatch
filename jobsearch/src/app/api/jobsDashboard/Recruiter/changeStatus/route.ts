import { connectToDatabase } from "@/app/lib/db";
import Candidates from "@/app/models/Candidates";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

export async function PUT(req: NextRequest) {
  try {
    await connectToDatabase();

    const { jobId, updateStatuses } = await req.json();

    if (!jobId || !updateStatuses) {
      return NextResponse.json({ message: "Missing required fields" }, { status: 400 });
    }
    
    const statusMap = new Map<string, string>(Object.entries(updateStatuses));

    if (statusMap.size === 0) {
      return NextResponse.json({ message: "No updates to apply" }, { status: 200 });
    }

    const updates = Array.from(statusMap.entries()).map(([userID, status]) => {
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
