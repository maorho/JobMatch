import { connectToDatabase } from "@/app/lib/db";
import Job from "@/app/models/Job";
import Company from "@/app/models/Company"; 
import { NextRequest, NextResponse } from "next/server";


export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    // NaN-safe: page ≥ 1, 1 ≤ limit ≤ 100 (no "limit=0" / "limit=1e9" catalogue dumps).
    const int = (v: string | null, fallback: number) => { const n = parseInt(v || "", 10); return Number.isFinite(n) ? n : fallback; };
    const page = Math.max(1, int(searchParams.get("page"), 1));
    const limit = Math.min(100, Math.max(1, int(searchParams.get("limit"), 50)));
    const skip = (page - 1) * limit;
    console.log("Company schema loaded:", Company?.modelName);
    const total = await Job.countDocuments();
    const alljobs = await Job.find().populate({
      path: "company",
      model: "Company", 
      select: "companyName",
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

    return NextResponse.json({
      jobs:alljobs,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("❌ Error fetching jobs:", error);
    return NextResponse.json(
      { message: "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}
