import { connectToDatabase } from "@/app/lib/db";
import mongoose from "mongoose";
import Job from "@/app/models/Job";
import Company from "@/app/models/Company"; 
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    
    console.log("Company schema loaded:", Company?.modelName);

    const alljobs = await Job.find().populate({
      path: "company",
      model: "Company", 
      select: "companyName",
    });

    return NextResponse.json(alljobs);
  } catch (error) {
    console.error("❌ Error fetching jobs:", error);
    return NextResponse.json(
      { message: "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}
