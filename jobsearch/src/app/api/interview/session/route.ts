import { NextRequest, NextResponse } from "next/server";
import { consumeQuota, quotaResponse } from "@/app/lib/ops/quota";
import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import User from "@/app/models/User";
import InterviewPrep from "@/app/models/InterviewPrep";
import InterviewSession from "@/app/models/InterviewSession";
import { STAGE_KEYS, type StageKey } from "@/app/lib/interview/prepare";
import { gatherCompanyContext } from "@/app/lib/interview/companyContext";
import CompanyBrief from "@/app/models/CompanyBrief";
import { researchToText } from "@/app/lib/interview/companyResearch";
import { reportedQuestionsText } from "@/app/lib/outcomes/questions";
import { buildCompanyBrief, interviewerTurn, type SessionTurn } from "@/app/lib/interview/simulator";
import { structuredToText, isStructuredResume } from "@/app/lib/resume/structuredToText";
import { loadCoachMemory, memoryToText } from "@/app/lib/interview/coachMemory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ANSWER = 4000;

async function resumeTextFor(userId: string): Promise<string> {
  const user: any = await User.findById(userId).select("+resumeText +resumeStructured").lean();
  return (user?.resumeText || "").trim() || (isStructuredResume(user?.resumeStructured) ? structuredToText(user.resumeStructured) : "");
}

const publicSession = (s: any) => ({
  sessionId: String(s._id),
  prepId: String(s.prepId),
  stage: s.stage,
  language: s.language,
  status: s.status,
  mode: s.mode || "chat",
  delivery: s.delivery || null,
  wrappedUp: !!s.wrappedUp,
  targetQuestions: s.targetQuestions,
  asked: (s.transcript || []).filter((t: any) => t.role === "interviewer").length,
  transcript: (s.transcript || []).map((t: any) => ({ role: t.role, content: t.content })),
  feedback: s.feedback || null,
  startedAt: s.createdAt,
  finishedAt: s.finishedAt || null,
});

/** GET ?sessionId=… → one session; GET ?prepId=… → the user's sessions for that plan (newest first). */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  await connectToDatabase();
  const sessionId = sp.get("sessionId");
  if (sessionId) {
    if (!mongoose.Types.ObjectId.isValid(sessionId)) return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 });
    const s: any = await InterviewSession.findOne({ _id: sessionId, userId }).lean();
    if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, session: publicSession(s) });
  }
  const prepId = sp.get("prepId") || "";
  if (!mongoose.Types.ObjectId.isValid(prepId)) return NextResponse.json({ error: "Invalid prepId" }, { status: 400 });
  const list: any[] = await InterviewSession.find({ userId, prepId }).sort({ createdAt: -1 }).limit(20).select("stage status mode wrappedUp targetQuestions transcript feedback.overallScore feedback.verdict createdAt finishedAt").lean();
  return NextResponse.json({
    ok: true,
    sessions: list.map((s) => ({ sessionId: String(s._id), stage: s.stage, status: s.status, mode: s.mode || "chat", asked: (s.transcript || []).filter((t: any) => t.role === "interviewer").length, targetQuestions: s.targetQuestions, overallScore: s.feedback?.overallScore ?? null, verdict: s.feedback?.verdict ?? "", startedAt: s.createdAt, finishedAt: s.finishedAt || null })),
  });
}

/** POST { prepId, stage, language?, questions? } → start an interview; returns the interviewer's opening. */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Daily cap on this paid action (lib/ops/quota.ts); 429 with a hint when spent.
  try {
    await consumeQuota(userId, "interview_session");
  } catch (e) {
    const q = quotaResponse(e);
    if (q) return q;
    throw e;
  }
  const body = await req.json().catch(() => ({}));
  const prepId = String(body?.prepId || "");
  const stage = (STAGE_KEYS as readonly string[]).includes(body?.stage) ? (body.stage as StageKey) : "hr";
  const language = body?.language === "en" ? "en" : "he";
  const targetQuestions = Math.min(Math.max(parseInt(body?.questions, 10) || 8, 3), 12);
  if (!mongoose.Types.ObjectId.isValid(prepId)) return NextResponse.json({ error: "Invalid prepId" }, { status: 400 });

  try {
    await connectToDatabase();
    const prep: any = await InterviewPrep.findOne({ _id: prepId, userId }).lean();
    if (!prep) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // The interviewer's knowledge: the plan's company section + live catalog signals (no website fetch here — keep the start snappy).
    const ctx = await gatherCompanyContext(prep.company, { fetchWebsite: false }).catch(() => null);
    const cachedResearch: any = await CompanyBrief.findOne({ key: String(prep.company || "").toLowerCase() }).lean().catch(() => null);
    const companyBrief = buildCompanyBrief(prep.plan, ctx, cachedResearch?.brief ? researchToText(cachedResearch.brief) : null, await reportedQuestionsText(prep.company, { limit: 12 }).catch(() => ""));
    const resumeText = await resumeTextFor(userId);
    const job = { title: prep.jobTitle, company: prep.company };
    const coachMemory = memoryToText(await loadCoachMemory(userId)) || undefined;
    const first = await interviewerTurn({ plan: prep.plan, stage, job, companyBrief, resumeText, language, targetQuestions, transcript: [], coachMemory });
    const session = await InterviewSession.create({
      userId, prepId, jobId: prep.jobId, source: prep.source, jobTitle: prep.jobTitle, company: prep.company, stage, language, targetQuestions, companyBrief,
      transcript: [{ role: "interviewer", content: first.message }],
    });
    return NextResponse.json({ ok: true, session: publicSession(session.toObject()) });
  } catch (err: any) {
    console.error("❌ interview session start:", err);
    return NextResponse.json({ error: err?.message || "Could not start the interview" }, { status: 500 });
  }
}

/** PATCH { sessionId, answer } → the candidate answers; returns the interviewer's next message (and whether the interview wrapped up). */
export async function PATCH(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const sessionId = String(body?.sessionId || "");
  const answer = String(body?.answer || "").trim().slice(0, MAX_ANSWER);
  if (!mongoose.Types.ObjectId.isValid(sessionId)) return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 });
  if (!answer) return NextResponse.json({ error: "Empty answer" }, { status: 400 });

  try {
    await connectToDatabase();
    const session: any = await InterviewSession.findOne({ _id: sessionId, userId });
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (session.status !== "active" || session.wrappedUp) return NextResponse.json({ error: "This interview is over — ask for the feedback." }, { status: 409 });
    const prep: any = await InterviewPrep.findById(session.prepId).lean();
    if (!prep) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

    session.transcript.push({ role: "candidate", content: answer });
    const transcript: SessionTurn[] = session.transcript.map((t: any) => ({ role: t.role, content: t.content }));
    const resumeText = await resumeTextFor(userId);
    const turn = await interviewerTurn({ plan: prep.plan, stage: session.stage, job: { title: session.jobTitle, company: session.company }, companyBrief: session.companyBrief, resumeText, language: session.language, targetQuestions: session.targetQuestions, transcript, coachMemory: memoryToText(await loadCoachMemory(userId)) || undefined });
    session.transcript.push({ role: "interviewer", content: turn.message });
    if (turn.done) session.wrappedUp = true;
    await session.save();
    return NextResponse.json({ ok: true, message: turn.message, done: turn.done, session: publicSession(session.toObject()) });
  } catch (err: any) {
    console.error("❌ interview session turn:", err);
    return NextResponse.json({ error: err?.message || "The interviewer did not answer" }, { status: 500 });
  }
}
