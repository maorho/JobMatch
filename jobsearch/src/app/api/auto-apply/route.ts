import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import AutoApplication from "@/app/models/AutoApplication";
import { startFlow, kick } from "@/app/lib/agents";
import { autoApplyForUser } from "@/app/lib/apply/autoApply";
import { loadJob } from "@/app/lib/jobs/loadJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → the user's auto-application log (newest first). */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectToDatabase();
  const items: any[] = await AutoApplication.find({ userId }).sort({ createdAt: -1 }).limit(50).lean();
  return NextResponse.json({
    ok: true,
    items: items.map((a) => ({
      _id: String(a._id),
      jobId: String(a.jobId),
      jobModel: a.jobModel,
      title: a.jobTitle,
      company: a.company,
      url: a.url,
      score: a.score,
      status: a.status,
      ats: a.ats,
      note: a.note,
      createdAt: a.createdAt,
      link: `/job/${a.jobModel === "Job" ? "internal" : "external"}/${String(a.jobId)}`,
    })),
  });
}

/** POST { action: "run" } → ask the agents to look for matches now; { action: "dismiss", id } → drop a hand-off; { action: "apply", jobId, jobModel? } → apply to one posting now (explicit: ignores the opt-in switch and the score bar). */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  await connectToDatabase();
  if (body?.action === "dismiss" && body?.id) {
    await AutoApplication.deleteOne({ _id: String(body.id), userId, status: { $in: ["needs_user", "failed"] } });
    return NextResponse.json({ ok: true });
  }
  if (body?.action === "apply" && body?.jobId) {
    const jobModel = body.jobModel === "Job" ? "Job" : "ExternalJobs";
    const job: any = await loadJob(jobModel === "Job" ? "internal" : "external", String(body.jobId));
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const company = jobModel === "Job" ? job.company?.companyName || "" : job.company || "";
    const r = await autoApplyForUser(userId, [{ jobId: String(job._id), jobModel, score: typeof body.score === "number" ? body.score : 100, title: job.job, company }], { explicit: true });
    return NextResponse.json({ ok: true, ...r });
  }
  if (body?.action === "run") {
    const { runId } = await startFlow("resume.updated", { userId }, { from: "user", startedBy: `user:${userId}`, title: "Auto-apply: run now", says: "The candidate asked for a pass over the catalog. Matcher — what clears the bar?" });
    kick();
    return NextResponse.json({ ok: true, runId });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
