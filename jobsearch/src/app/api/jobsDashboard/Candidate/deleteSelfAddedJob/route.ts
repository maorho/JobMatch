import { connectToDatabase } from "@/app/lib/db";
import { AppJwtPayload, verifyJwt } from "@/app/lib/jwt";
import AddedJobs from "@/app/models/AddedJobs";
import { NextRequest, NextResponse } from "next/server";


export async function DELETE(req:NextRequest){
    connectToDatabase();
    const token = req.cookies.get("token")?.value;

    if (!token) {
        return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    }
    let decoded;
      try {
        decoded = await verifyJwt<AppJwtPayload>(token);
      } catch {
        return NextResponse.json({ message: "Invalid or expired token" }, { status: 401 });
      }
    
      if (!decoded) {
        return NextResponse.json({ message: "Invalid or expired token" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const job = searchParams.get("jobId");
    if(!job){
        return NextResponse.json({msg:'missing required field',status:404});
    }
    console.log('jobid:',job)
    const exist = await AddedJobs.findById(job);
    if(!exist){
        return NextResponse.json({msg:'job not exsit',status:400});
    }
    await AddedJobs.findByIdAndDelete(job);
    return NextResponse.json({msg:'Job Deleted Successfully'});
}