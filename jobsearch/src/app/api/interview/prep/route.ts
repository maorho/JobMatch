import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import User from "@/app/models/User";
import Job from "@/app/models/Job";
import Company from "@/app/models/Company";
import ExternalJobs from "@/app/models/ExternalJobs";
import InterviewPrep from "@/app/models/InterviewPrep";
import { gatherCompanyContext } from "@/app/lib/interview/companyContext";
import { generateInterviewPlan, PREP_MODEL } from "@/app/lib/interview/prepare";
import { structuredToText, isStructuredResume } from "@/app/lib/resume/structuredToText";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

async function loadJob(source: string, jobId: string) {
  if (source === "internal") {
    const j: any = await Job.findById(jobId).populate({ path: "company", model: Company, select: "companyName" }).lean();
    return j ? { title: j.job, company: j.company?.companyName || "", description: [j.description, j.qualifications].filter(Boolean).join("\n\n"), seniority: [] as string[] } : null;
  }
  const j: any = await ExternalJobs.findById(jobId).lean();
  return j ? { title: j.job, company: j.company, description: j.description || "", seniority: j.seniority || [] } : null;
}

/**
 * POST { jobId, source, force?, language? } → the user's interview plan for
 * that job (cached per user+job; `force` regenerates).
 * GET  ?jobId=&source=                        → the cached plan or 404.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const jobId = String(body?.jobId || "");
  const source = body?.source === "internal" ? "internal" : "external";
  const language = body?.language === "en" ? "en" : "he";
  if (!mongoose.Types.ObjectId.isValid(jobId)) return NextResponse.json({ error: "Invalid jobId" }, { status: 400 });

  try {
    await connectToDatabase();
    if (!body?.force) {
      const cached: any = await InterviewPrep.findOne({ userId, jobId, source }).lean();
      if (cached) return NextResponse.json({ ok: true, cached: true, prepId: String(cached._id), job: { title: cached.jobTitle, company: cached.company }, plan: cached.plan });
    }
    const job = await loadJob(source, jobId);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const user: any = await User.findById(userId).select("+resumeText +resumeStructured").lean();
    const resumeText = (user?.resumeText || "").trim() || (isStructuredResume(user?.resumeStructured) ? structuredToText(user.resumeStructured) : "");
    const companyContext = await gatherCompanyContext(job.company, { fetchWebsite: process.env.NODE_ENV !== "test" });
    const plan = await generateInterviewPlan({ job, companyContext, resumeText, language });

    const doc: any = await InterviewPrep.findOneAndUpdate(
      { userId, jobId, source },
      { $set: { jobTitle: job.title, company: job.company, plan, model: PREP_MODEL } },
      { upsert: true, new: true }
    );
    return NextResponse.json({ ok: true, cached: false, prepId: String(doc._id), job: { title: job.title, company: job.company }, plan, context: { techSignals: companyContext.techSignals, openRoles: companyContext.openRoles, website: !!companyContext.websiteExcerpt } });
  } catch (err: any) {
    console.error("❌ interview prep:", err);
    return NextResponse.json({ error: err?.message || "Failed to prepare" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const jobId = req.nextUrl.searchParams.get("jobId") || "";
  const source = req.nextUrl.searchParams.get("source") === "internal" ? "internal" : "external";
  if (!mongoose.Types.ObjectId.isValid(jobId)) return NextResponse.json({ error: "Invalid jobId" }, { status: 400 });
  await connectToDatabase();
  const cached: any = await InterviewPrep.findOne({ userId, jobId, source }).lean();
  if (!cached) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, cached: true, prepId: String(cached._id), job: { title: cached.jobTitle, company: cached.company }, plan: cached.plan });
}
