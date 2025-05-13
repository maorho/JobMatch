import { connectToDatabase } from "@/app/lib/db";
import Job from "@/app/models/Job";
import { NextRequest, NextResponse } from "next/server";
import Candidates from "@/app/models/Candidates";

export async function POST(req: NextRequest) {
  await connectToDatabase();

  const { recruiterId } = await req.json();

  if (!recruiterId) {
    return NextResponse.json({ message: "Missing recruiterId" }, { status: 400 });
  }

  const jobs = await Job.find({ publisher: recruiterId }).lean(); // lean() for plain objects

  // עבור כל משרה – תביא כמה מועמדים הגישו אליה
  const jobsWithCounts = await Promise.all(
    jobs.map(async (job) => {
      const candidateCount = await Candidates.countDocuments({ jobId: job._id });
      return {
        ...job,
        candidateCount,
      };
    })
  );

  return NextResponse.json(jobsWithCounts);
}
