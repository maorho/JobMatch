import { connectToDatabase } from '@/app/lib/db';
import Candidates from '@/app/models/Candidates';
import { getUserIdFromRequest } from '@/app/lib/getUserIdFromRequest';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const { status, jobId } = await req.json();
    if (!jobId) {
        return NextResponse.json({ message: 'Missing jobId' }, { status: 400 });
    }

    await connectToDatabase();
    // candidateId always comes from the authenticated token, never the body.
    const exists = await Candidates.findOne({ jobId, candidateId: userId });
    if (exists) {
        return NextResponse.json({ message: 'You have already applied to this job.' }, { status: 409 });
    }
    await Candidates.create({ candidateId: userId, jobId, jobModel: 'Job', status });

    // Let the recruiter who published the job know (best-effort).
    try {
      const { default: Job } = await import("@/app/models/Job");
      const { notify } = await import("@/app/lib/notifications/notify");
      const job: any = await Job.findById(jobId).select("publisher job").lean();
      if (job?.publisher) {
        await notify(String(job.publisher), {
          type: "application_received",
          title: `מועמדות חדשה למשרה: ${job.job}`,
          body: "מועמד/ת חדש/ה הגיש/ה מועמדות. אפשר לראות את הפרופיל בדשבורד המגייס.",
          link: "/RecruiterDashboard",
          meta: { jobId: String(jobId), candidateId: String(userId) },
        });
      }
    } catch (e) {
      console.warn("[application] notify skipped:", (e as Error)?.message);
    }
    return NextResponse.json({ message: 'Application Succeed,Thank You!' });
}
