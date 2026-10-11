import { connectToDatabase } from '@/app/lib/db';
import Candidates from '@/app/models/Candidates';
import { getUserIdFromRequest } from '@/app/lib/getUserIdFromRequest';
import { NextRequest, NextResponse } from 'next/server';
import { ensureOutcome } from '@/app/lib/outcomes/outcomes';

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
    const exists = await Candidates.findOne({ jobId, candidateId: userId });
    if (exists) {
        return NextResponse.json({ message: 'You have already applied to this job.' }, { status: 409 });
    }
    const created = await Candidates.create({ candidateId: userId, jobId, jobModel: 'ExternalJobs', status });
    await ensureOutcome(userId, String(created._id)); // outcome loop: snapshot the match features now, ask "did you get a reply?" later
    return NextResponse.json({ message: 'Application Succeed,Thank You!' });
}
