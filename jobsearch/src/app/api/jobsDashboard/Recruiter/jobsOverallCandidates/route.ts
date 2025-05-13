import { connectToDatabase } from '@/app/lib/db';
import Candidates from '@/app/models/Candidates';
import Job from '@/app/models/Job';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest){
    await connectToDatabase();
    const { jobId, companyName } = await req.json();
    const job = await Job.findById(jobId).populate("company");
    if (!job || job.company.companyName !== companyName) {
      return NextResponse.json(
        { message: "Job not found or not owned by company" },
        { status: 404 }
      );
    }
    const candidates = await Candidates.find({ jobId })
    .populate({
      path: "candidateId",
      model: "User", // מביא את הפרטים של המשתמש (המועמד)
      select: "_id fullname email phone resume currentJob", // רק מה שצריך
    });
  return NextResponse.json(candidates);

}