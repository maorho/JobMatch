import { connectToDatabase } from '@/app/lib/db';
import Candidates from '@/app/models/Candidates';
import Job from '@/app/models/Job';
import { requireRecruiterOrAdmin } from '@/app/lib/authGuard';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest){
    const auth = await requireRecruiterOrAdmin(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await connectToDatabase();

    const { jobId } = await req.json();
    const job = await Job.findById(jobId).populate("company");
    // Guard the populate result (company may be null/deleted) and check ownership
    // against the authenticated user's own company — not a client-supplied name.
    const jobCompanyName = (job?.company as any)?.companyName;
    if (!job || (!auth.admin && jobCompanyName !== auth.company)) {
      return NextResponse.json(
        { message: "Job not found or not owned by company" },
        { status: 404 }
      );
    }
    const candidates = await Candidates.find({ jobId })
    .populate({
      path: "candidateId",
      model: "User",
      select: "_id fullname email phone resume currentJob",
    });
  return NextResponse.json(candidates);
}
