import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import InterviewPrep from "@/app/models/InterviewPrep";
import { ensureInterviewPlan } from "@/app/lib/interview/ensurePlan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

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
    const r = await ensureInterviewPlan({ userId, jobId, source, force: !!body?.force, language });
    if (!r) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    return NextResponse.json({ ok: true, cached: r.cached, prepId: r.prepId, job: r.job, plan: r.plan, ...(r.cached ? {} : { context: { techSignals: r.techSignals } }) });
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
