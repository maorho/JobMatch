import { connectToDatabase } from "@/app/lib/db";
import AddedJobs from "@/app/models/AddedJobs";
import "@/app/models/Job";
import "@/app/models/ExternalJobs";
import "@/app/models/Candidates";
import "@/app/models/AddedJobs";
import "@/app/models/Company";
import "@/app/models/User";
import Candidates from "@/app/models/Candidates";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  await connectToDatabase();

  // A user can only read their own applications (id from the token, not body).
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
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
  const selfAdding = await AddedJobs.find({candidateId:userId});
  const resp = [
  ...applications
    .filter((a: any) => a.jobId != null)
    .map((e) => ({ ...e, source: "internal" })),
  ...externalApplication
    .filter((a: any) => a.jobId != null)
    .map((e) => ({ ...e, source: "external" })),
  ...selfAdding
];

  return NextResponse.json(resp);
}
