import { connectToDatabase } from "@/app/lib/db";
import Job from "@/app/models/Job";
import Candidates from "@/app/models/Candidates";
import Company from "@/app/models/Company";
import { requireRecruiterOrAdmin } from "@/app/lib/authGuard";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const auth = await requireRecruiterOrAdmin(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectToDatabase();

  const { companyName } = await req.json();
  // A recruiter may only read their own company's jobs; admins may read any.
  if (!auth.admin && companyName !== auth.company) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
