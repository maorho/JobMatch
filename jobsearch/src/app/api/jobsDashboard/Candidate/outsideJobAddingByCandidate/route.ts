import { NextRequest, NextResponse } from "next/server";
import { verifyJwt } from "@/app/lib/jwt";
import { connectToDatabase } from "@/app/lib/db";
import AddedJobs from "@/app/models/AddedJobs";

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();

    // 1️⃣ קבלת ה־JWT מה־cookie
    const token = req.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    }

    // 2️⃣ פענוח JWT → קבלת userId
    const decoded = await verifyJwt<{ id: string }>(token);
    if (!decoded?.id) {
      return NextResponse.json({ message: "Invalid token" }, { status: 401 });
    }

    const userId = decoded.id;

    // 3️⃣ קריאת הנתונים מה־form
    const form = await req.formData();

    const jobTitle = form.get("jobtitle")?.toString();
    const company = form.get("company")?.toString();
    const jobType = form.get("jobtype")?.toString();
    const location = form.get("location")?.toString();
    const link = form.get("link")?.toString();
    const status = form.get("status")?.toString() || "Submitted Resume";

    if (!jobTitle || !company || !jobType || !location || !link) {
      return NextResponse.json({ message: "Missing required fields" }, { status: 400 });
    }

    // 4️⃣ יצירת הרשומה ב־Mongo
    const newJob = await AddedJobs.create({
      candidateId: userId,
      status,
      jobTitle,
      company,
      jobType,
      location,
      link,
    });

    return NextResponse.json({
      message: "Position Added Successfully",
      jobId: newJob._id,
    });

  } catch (error) {
    console.error("❌ ERROR ADDING JOB:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
