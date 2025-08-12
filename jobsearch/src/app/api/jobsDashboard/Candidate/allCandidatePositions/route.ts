import { connectToDatabase } from "@/app/lib/db";
import Candidates from "@/app/models/Candidates";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  await connectToDatabase();

  const { userId } = await req.json();
  if (!userId) {
    return NextResponse.json({ message: "Missing userId" }, { status: 400 });
  }

  const applications = await Candidates.find({
    candidateId: userId,
    jobId: { $ne: null },               // סינון כבר בשאילתה
  })
    .populate({
      path: "jobId",
      // אל תגדיר model כדי לאפשר refPath (Job / ExternalJobs)
      select: "job company type city country link url finalUrl description skills seniority",
      populate: [
        // ירוץ רק כשהמודל הוא Job (company כ-ObjectId); יתעלם ב-ExternalJobs (company:string)
        { path: "company", select: "companyName" },
      ],
    })
    .lean();
    const externalApplication = await Candidates.find({
    candidateId: userId,
    jobId: { $ne: null },               // סינון כבר בשאילתה
  })
    .populate({
      path: "jobId",
      model:"ExternalJobs",
      select: "job company city country finalUrl"
    })
    .lean();
  const externalApplication2 = externalApplication.filter((a: any) => a.jobId != null);
  const applications2 = applications.filter((a: any) => a.jobId != null);
  const resp = [
  ...applications
    .filter((a: any) => a.jobId != null)
    .map((e) => ({ ...e, source: "internal" })),
  ...externalApplication
    .filter((a: any) => a.jobId != null)
    .map((e) => ({ ...e, source: "external" })),
];

  return NextResponse.json(resp);
}
