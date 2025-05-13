import { connectToDatabase } from "@/app/lib/db";
import mongoose from "mongoose";
import Job from "@/app/models/Job";
import Company from "@/app/models/Company";
import Candidate from "@/app/models/Candidates";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ message: "Missing userId" }, { status: 400 });
    }

    // שלב 1: השג את רשימת המשרות אליהן המשתמש כבר הגיש קורות חיים
    const submitted = await Candidate.find({ candidateId: userId }).select("jobId");
    const submittedJobIds = submitted.map((entry) => entry.jobId.toString());

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
