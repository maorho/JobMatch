import { connectToDatabase } from "@/app/lib/db";
import Job from "@/app/models/Job";
import Candidates from "@/app/models/Candidates";
import Company from "@/app/models/Company";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  await connectToDatabase();

  const { companyName } = await req.json();

  const company = await Company.findOne({ companyName });

  if (!company) {
    return NextResponse.json({ message: "Company not found" }, { status: 404 });
  }

  const jobs = await Job.find({ company: company._id })
    .populate("company", "companyName")
    .lean();

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
