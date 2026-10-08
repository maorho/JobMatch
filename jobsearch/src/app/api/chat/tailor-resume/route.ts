import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import User from "@/app/models/User";
import Job from "@/app/models/Job";
import Company from "@/app/models/Company";
import ExternalJobs from "@/app/models/ExternalJobs";
import { tailorResumeToJob } from "@/app/lib/resume/tailor";
import { isStructuredResume } from "@/app/lib/resume/structuredToText";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST { jobId, source: "external" | "internal", language?: "he" | "en" }
 * Tailors the signed-in user's stored résumé to one job posting.
 * 400 NO_RESUME when the user has not built/uploaded a résumé yet.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const jobId = String(body?.jobId || "");
  const source = body?.source === "internal" ? "internal" : "external";
  const language = body?.language === "en" ? "en" : "he";
  if (!mongoose.Types.ObjectId.isValid(jobId)) {
    return NextResponse.json({ error: "Invalid jobId" }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const user: any = await User.findById(userId)
      .select("+resumeText +resumeStructured fullname email phone currentJob memory")
      .lean();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const hasResume = isStructuredResume(user.resumeStructured) || !!(user.resumeText || "").trim();
    if (!hasResume) {
      return NextResponse.json(
        { error: "NO_RESUME", message: "Build or upload a résumé in ResumeAI first" },
        { status: 400 }
      );
    }

    let job: { title: string; company: string; description: string; city?: string; country?: string } | null = null;
    if (source === "external") {
      const j: any = await ExternalJobs.findById(jobId).lean();
      if (j) job = { title: j.job, company: j.company, description: j.description || "", city: j.city, country: j.country };
    } else {
      const j: any = await Job.findById(jobId).populate({ path: "company", model: Company, select: "companyName" }).lean();
      if (j) job = { title: j.job, company: j.company?.companyName || "", description: [j.description, j.qualifications].filter(Boolean).join("\n\n"), city: j.city, country: j.country };
    }
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const result = await tailorResumeToJob({
      resumeStructured: user.resumeStructured,
      resumeText: user.resumeText,
      profile: { fullname: user.fullname, email: user.email, phone: user.phone, currentJob: user.currentJob },
      job,
      language,
    });

    return NextResponse.json({ ok: true, job: { title: job.title, company: job.company }, ...result });
  } catch (err: any) {
    if (err?.code === "NO_RESUME") {
      return NextResponse.json({ error: "NO_RESUME" }, { status: 400 });
    }
    console.error("❌ tailor-resume error:", err);
    return NextResponse.json({ error: err?.message || "Tailoring failed" }, { status: 500 });
  }
}
