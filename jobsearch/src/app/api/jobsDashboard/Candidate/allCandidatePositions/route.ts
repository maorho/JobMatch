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
      model:"Job",
      select: "job company type city country link description qualifications",
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
