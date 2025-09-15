import { connectToDatabase } from "@/app/lib/db";
import mongoose from "mongoose";
import Job from "@/app/models/Job";
import Company from "@/app/models/Company"; 
import { NextRequest, NextResponse } from "next/server";
import { Jobs } from "openai/resources/fine-tuning/jobs/jobs.mjs";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
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
    .limit(limit);;

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
