import { connectToDatabase } from '@/app/lib/db';
import Candidates from '@/app/models/Candidates';
import { getUserIdFromRequest } from '@/app/lib/getUserIdFromRequest';
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { ensureOutcome } from '@/app/lib/outcomes/outcomes';

// The schema's own status list — anything else is rejected before it reaches Mongo.
const STATUSES: string[] = (Candidates.schema.path('status') as any).enumValues || [];
const ALREADY = () => NextResponse.json({ message: 'You have already applied to this job.' }, { status: 409 });

export async function POST(req: NextRequest) {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const { status, jobId } = await req.json().catch(() => ({}));
    if (!jobId || !mongoose.isValidObjectId(jobId)) {
        return NextResponse.json({ message: 'Missing jobId' }, { status: 400 });
    }
    if (status !== undefined && !STATUSES.includes(status)) {
        return NextResponse.json({ message: 'Invalid status' }, { status: 400 });
    }

    await connectToDatabase();
    // candidateId always comes from the authenticated token, never the body.
    const exists = await Candidates.findOne({ jobId, candidateId: userId });
    if (exists) return ALREADY();
    let created;
    try {
        created = await Candidates.create({ candidateId: userId, jobId, jobModel: 'ExternalJobs', ...(status ? { status } : {}) });
    } catch (e: any) {
        if (e?.code === 11000) return ALREADY(); // raced our own check: the unique (candidateId, jobId) index caught it
        throw e;
    }
    await ensureOutcome(userId, String(created._id)); // outcome loop: snapshot the match features now, ask "did you get a reply?" later
    return NextResponse.json({ message: 'Application Succeed,Thank You!' });
}
