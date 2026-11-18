import { NextRequest, NextResponse } from "next/server";
import { consumeQuota, quotaResponse } from "@/app/lib/ops/quota";
import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import InterviewPrep from "@/app/models/InterviewPrep";
import { ensureInterviewPlan, interviewPlanStatus } from "@/app/lib/interview/ensurePlan";

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

  // A plan that exists or is being generated costs nothing: the quota (lib/ops/quota.ts) is charged for a generation only.
  const current = await interviewPlanStatus(userId, jobId, source);
  if (current.status === "ready" && !body?.force) return NextResponse.json({ ok: true, cached: true, prepId: current.prepId, job: current.job, plan: current.plan });
  if (current.status === "generating") return NextResponse.json({ ok: true, pending: true, startedAt: current.startedAt }, { status: 202 });
  try {
    await consumeQuota(userId, "prep_plan");
  } catch (e) {
    const q = quotaResponse(e);
    if (q) return q;
    throw e;
  }

  try {
    const r = await ensureInterviewPlan({ userId, jobId, source, force: !!body?.force, language });
    if (!r) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    if ("pending" in r) return NextResponse.json({ ok: true, pending: true, startedAt: r.startedAt }, { status: 202 });
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
  // 200 in every case: "none" (nothing yet), "generating" (another request is building it: poll), or the plan.
  const s = await interviewPlanStatus(userId, jobId, source);
  if (s.status === "none") return NextResponse.json({ ok: true, found: false }, { headers: { "Cache-Control": "private, no-store" } });
  if (s.status === "generating") return NextResponse.json({ ok: true, found: false, pending: true, startedAt: s.startedAt }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
  return NextResponse.json({ ok: true, found: true, cached: true, prepId: s.prepId, job: s.job, plan: s.plan }, { headers: { "Cache-Control": "private, no-store" } });
}
