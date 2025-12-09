import { connectToDatabase } from "@/app/lib/db";
import Company from "@/app/models/Company";
import User from "@/app/models/User";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    await connectToDatabase();
    const {companyName} = await req.json();
    const company = await Company.findOne({ companyName });
    if(!company){
        return new NextResponse("company not found");
    }
    const companyId = company._id;
    const recruiters = await User.find({
    recruiter: true,
    $or: [{ admin: false }, { admin: { $exists: false } }],
    company_id: companyId,
  })
    .populate({
      path: "company_id",
      model: "Company",
      select: "companyName", 
    })
    .lean();
    if(!recruiters){
        return NextResponse.json({msg:"there are no recriuters",status:404})
    }
    return NextResponse.json(recruiters);
}