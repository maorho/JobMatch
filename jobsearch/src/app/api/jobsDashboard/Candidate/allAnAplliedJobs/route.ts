import { connectToDatabase } from "@/app/lib/db";
import mongoose from "mongoose";
import Job from "@/app/models/Job";
import Company from "@/app/models/Company";
import Candidate from "@/app/models/Candidates";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    // Id from the token, not the query string.
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // שלב 1: השג את רשימת המשרות אליהן המשתמש כבר הגיש קורות חיים
    const submitted = await Candidate.find({ candidateId: userId }).select("jobId");
    const submittedJobIds = submitted
      .map((entry) => entry.jobId?.toString())
      .filter(Boolean);

    // שלב 2: שלוף את כל המשרות שלא מופיעות ברשימה הזו
    const availableJobs = await Job.find({
      _id: { $nin: submittedJobIds },
    }).populate({
      path: "company",
      model: "Company",
      select: "companyName",
    });

    return NextResponse.json(availableJobs);
  } catch (error) {
    console.error("❌ Error fetching unsubmitted jobs:", error);
    return NextResponse.json({ message: "Failed to fetch jobs" }, { status: 500 });
  }
}
