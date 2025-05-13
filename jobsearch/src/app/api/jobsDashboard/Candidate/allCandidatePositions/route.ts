import { connectToDatabase } from "@/app/lib/db";
import Candidates from "@/app/models/Candidates";
import Company from "@/app/models/Company";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  await connectToDatabase();

  const { userId } = await req.json();

  if (!userId) {
    return NextResponse.json({ message: "Missing userId" }, { status: 400 });
  }

  const applications = await Candidates.find({ candidateId: userId })
    .populate({
      path: "jobId",
      model:"Job",
      select: "job company type location country",
      populate: {
        path: "company",
        model: "Company",
        select: "companyName"
      } 
    });

  return NextResponse.json(applications);
}
