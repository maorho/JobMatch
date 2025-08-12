import { connectToDatabase } from '@/app/lib/db';
import Candidates from '@/app/models/Candidates';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    const { status,jobId,candidateId} = await req.json();
    
    await connectToDatabase();
    
    const exists = await Candidates.findOne({ jobId, candidateId });
    if (exists) {
     return NextResponse.json({ message: 'You have already applied to this job.' }, { status: 409 });
    }
    await Candidates.create({ candidateId, jobId: jobId, jobModel: 'ExternalJobs', status });
    const response = NextResponse.json({message: 'Application Succeed,Thank You!'});
    return response; 
}