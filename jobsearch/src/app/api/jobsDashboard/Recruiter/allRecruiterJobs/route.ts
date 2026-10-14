import { connectToDatabase } from "@/app/lib/db";
import Job from "@/app/models/Job";
import { NextRequest, NextResponse } from "next/server";
import Candidates from "@/app/models/Candidates";
import { requireRecruiterOrAdmin, recruiterDenied } from "@/app/lib/authGuard";

export async function POST(req: NextRequest) {
  // Always the signed-in recruiter's own postings; the body is not consulted.
  const auth = await requireRecruiterOrAdmin(req);
  if (!auth) return recruiterDenied(req);
  await connectToDatabase();

  const jobs = await Job.find({ publisher: auth.id }).lean(); // lean() for plain objects

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
