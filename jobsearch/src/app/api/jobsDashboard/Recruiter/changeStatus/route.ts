// /app/api/candidates/update-status/route.ts

import { connectToDatabase } from "@/app/lib/db";
import Candidates from "@/app/models/Candidates";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest) {
  try {
    await connectToDatabase();

    const { jobId, updateStatuses } = await req.json();
    console.log(updateStatuses);
    if (!jobId || !updateStatuses) {
      return NextResponse.json({ message: "Missing required fields" }, { status: 400 });
    }

    if (updateStatuses.length === 0) {
      return NextResponse.json({ message: "No updates to apply" }, { status: 200 });
    }

    const updated = await Candidates.bulkWrite(
      updateStatuses.map(({ userID, status }:{userID:string, status:string}) => ({
        updateOne: {
          filter: { _id: userID },
          update: { $set: { status } },
        },
      }))
    );

    return NextResponse.json({
      message: "Candidates status updated successfully",
      updated,
    });
  } catch (err) {
    console.error("Error updating candidate statuses:", err);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
