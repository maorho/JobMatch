import { connectToDatabase } from "@/app/lib/db";
import Company from "@/app/models/Company";
import User from "@/app/models/User";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/authGuard";

export async function POST(req: NextRequest) {
    if (!(await requireAdmin(req)))
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectToDatabase();
    const {companyName} = await req.json();
    const company = await Company.findOne({ companyName });
    if(!company){
        return NextResponse.json({ error: "company not found" }, { status: 404 });
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
    return NextResponse.json(recruiters);
}