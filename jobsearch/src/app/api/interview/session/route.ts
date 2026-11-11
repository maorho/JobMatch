import { NextRequest, NextResponse, after } from "next/server";
import { consumeQuota, quotaResponse } from "@/app/lib/ops/quota";
import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import User from "@/app/models/User";
import InterviewPrep from "@/app/models/InterviewPrep";
import InterviewSession from "@/app/models/InterviewSession";
import { STAGE_KEYS, type StageKey, type InterviewPlan } from "@/app/lib/interview/prepare";
import { gatherCompanyContext } from "@/app/lib/interview/companyContext";
import CompanyBrief from "@/app/models/CompanyBrief";
import { researchToText } from "@/app/lib/interview/companyResearch";
import { buildCompanyBrief, interviewerTurn, pickStyle, isStyle, mainQuestionsAsked, CODE_SUBMITTED_PREFIX, type SessionTurn } from "@/app/lib/interview/simulator";
import { structuredToText, isStructuredResume } from "@/app/lib/resume/structuredToText";
import { loadCoachMemory, memoryToText, retestItems } from "@/app/lib/interview/coachMemory";
import { reviewPendingAnswers, generateAndStoreFeedback } from "@/app/lib/interview/feedbackJob";
import { realQuestionsForInterview } from "@/app/lib/interview/realQuestions";
import { loadJob } from "@/app/lib/jobs/loadJob";
import { tasksFor, startAttempt } from "@/app/lib/practice/attempts";
import { inferRole, type PracticeLevel } from "@/app/lib/practice/roles";
import { seniorityOf } from "@/app/lib/jobTaxonomy";
import PracticeTask from "@/app/models/PracticeTask";
import PracticeAttempt from "@/app/models/PracticeAttempt";

type Turn = { role: "interviewer" | "candidate"; content: string; kind?: "main" | "followup" };
type Review = { index: number; score?: number; kind?: string };
type CodeTaskState = { attemptId?: unknown; taskId?: unknown; title?: string; timeLimitMin?: number; status?: string; score?: number | null; verdict?: string };
type SessionLike = {
  _id: unknown;
  prepId: unknown;
  stage: string;
  language: "he" | "en";
  status: string;
  mode?: string;
  delivery?: unknown;
  wrappedUp?: boolean;
  targetQuestions: number;
  persona?: string;
  realQuestions?: { count?: number; stageCount?: number; harvest?: string; text?: string };
  codeTask?: CodeTaskState;
  transcript?: Turn[];
  reviews?: Review[];
  feedback?: unknown;
  createdAt?: Date;
  finishedAt?: Date | null;
};
type TaskLite = { _id: unknown; title: string; timeLimitMin?: number; done?: boolean };
type AttemptLite = { _id: unknown; status?: string; score?: number | null; verdict?: string; breakdown?: { criterion: string; score: number }[]; timedOut?: boolean; durationSec?: number; language?: string; answer?: string; taskId?: unknown };
type Posting = { description?: string; qualifications?: string; requirements?: unknown; tech?: unknown };
type PrepLite = { company: string; jobTitle: string; jobId: unknown; source: string; plan: InterviewPlan };
const errMsg = (e: unknown) => (e as { message?: string })?.message;

/** What the interviewer presents and probes: the posting's text and its stated requirements/technologies. */
async function postingFor(source: string, jobId: unknown): Promise<{ jobDescription?: string; jobRequirements?: string[] }> {
  const j = (await loadJob(source, String(jobId)).catch(() => null)) as Posting | null;
  if (!j) return {};
  const reqs = [...(Array.isArray(j.requirements) ? j.requirements : []), ...(Array.isArray(j.tech) ? j.tech : [])].map(String).filter(Boolean);
  return { jobDescription: String(j.description || j.qualifications || "").replace(/\s+/g, " ").slice(0, 1800), jobRequirements: [...new Set(reqs)].slice(0, 14) };
}

/** Stages where the interviewer may hand out a timed coding exercise (chat mode). */
const CODE_STAGES = new Set<string>(["technical", "system_design"]);

/** Run work after the response is sent (Next `after`); skipped in tests, which drive these jobs explicitly. */
function background(fn: () => Promise<unknown>) {
  if (process.env.NODE_ENV === "test") return;
  try {
    after(() => fn().catch((e) => console.warn("[interview] background job failed:", errMsg(e))));
  } catch {
    void fn().catch((e) => console.warn("[interview] background job failed:", errMsg(e)));
  }
}

const levelOf = (title: string): PracticeLevel => {
  const s = seniorityOf(title, undefined);
  return s === "Senior" ? "senior" : s === "Mid" ? "mid" : "junior";
};

/**
 * The interviewer asked for a coding exercise: pick one the candidate has not
 * done (role from the job, level from the title), start the clock, and link
 * the attempt to this session. Returns null when the bank has nothing ready
 * (authoring new tasks takes a model call we don't want inside a turn).
 */
async function handOutCodeTask(session: { _id: unknown; jobTitle: string }, userId: string, roleSummary: string): Promise<{ attemptId: string; taskId: string; title: string; timeLimitMin: number } | null> {
  const role = inferRole(`${session.jobTitle}\n${roleSummary}`);
  const level = levelOf(session.jobTitle);
  let task: TaskLite | null = ((await tasksFor(role, level, { kinds: ["coding"], author: false, userId }).catch(() => [])) as TaskLite[]).find((t) => !t.done) || null;
  if (!task) {
    const done = new Set(((await PracticeAttempt.find({ userId, status: { $ne: "in_progress" } }).select("taskId").lean()) as unknown as { taskId: unknown }[]).map((a) => String(a.taskId)));
    const candidates = (await PracticeTask.find({ kind: "coding", role, active: true }).sort({ difficulty: 1 }).limit(20).lean()) as unknown as TaskLite[];
    task = candidates.find((t) => !done.has(String(t._id))) || null;
  }
  if (!task) return null;
  const attempt = await startAttempt(userId, String(task._id));
  if (!attempt) return null;
  await PracticeAttempt.updateOne({ _id: attempt._id }, { $set: { interviewSessionId: session._id } });
  return { attemptId: String(attempt._id), taskId: String(task._id), title: task.title, timeLimitMin: task.timeLimitMin || 0 };
}

/** The candidate's solution, back into the conversation as one turn the interviewer can question. */
function codeSubmittedTurn(task: { title?: string } | null, attempt: AttemptLite): string {
  const grade = attempt.score != null ? `${attempt.score}/100` : "pending";
  const verdict = attempt.verdict ? ` (${attempt.verdict})` : "";
  const crit = (attempt.breakdown || []).slice(0, 4).map((b) => `${b.criterion}: ${b.score}`).join(", ");
  return `${CODE_SUBMITTED_PREFIX} "${task?.title || "coding exercise"}" — automatic grade ${grade}${verdict}${crit ? `; ${crit}` : ""}${attempt.timedOut ? "; handed in late" : ""}; ${attempt.durationSec ? `${Math.round(attempt.durationSec / 60)} min` : ""}\n\`\`\`${attempt.language || ""}\n${String(attempt.answer || "").slice(0, 2500)}\n\`\`\``;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ANSWER = 4000;

async function resumeTextFor(userId: string): Promise<string> {
  const user = (await User.findById(userId).select("+resumeText +resumeStructured").lean()) as unknown as { resumeText?: string; resumeStructured?: unknown } | null;
  return (user?.resumeText || "").trim() || (isStructuredResume(user?.resumeStructured) ? structuredToText(user!.resumeStructured as Parameters<typeof structuredToText>[0]) : "");
}

/**
 * Main questions asked so far (the opening included). Chat turns carry their
 * own `kind`; a voice session has no marks, so its reviewed follow-ups are
 * subtracted instead (one answer behind, like the browser's budget).
 */
function askedOf(s: SessionLike): number {
  const turns = (s.transcript || []).filter((t) => t.role === "interviewer");
  if (s.mode === "voice") return Math.max(0, turns.length - (s.reviews || []).filter((r) => r.kind && r.kind !== "main").length);
  return turns.filter((t) => t.kind !== "followup").length;
}

const publicSession = (s: SessionLike) => ({
  sessionId: String(s._id),
  prepId: String(s.prepId),
  stage: s.stage,
  language: s.language,
  status: s.status,
  mode: s.mode || "chat",
  delivery: s.delivery || null,
  wrappedUp: !!s.wrappedUp,
  targetQuestions: s.targetQuestions,
  persona: s.persona || "",
  realQuestions: s.realQuestions ? { count: s.realQuestions.count || 0, stageCount: s.realQuestions.stageCount || 0, harvest: s.realQuestions.harvest || "skipped" } : null,
  codeTask: s.codeTask?.status ? { attemptId: String(s.codeTask.attemptId), title: s.codeTask.title, timeLimitMin: s.codeTask.timeLimitMin, status: s.codeTask.status, score: s.codeTask.score ?? null } : null,
  asked: askedOf(s),
  transcript: (s.transcript || []).map((t) => ({ role: t.role, content: t.content })),
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
    const s = (await InterviewSession.findOne({ _id: sessionId, userId }).lean()) as unknown as SessionLike | null;
    if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, session: publicSession(s) });
  }
  const prepId = sp.get("prepId") || "";
  if (!mongoose.Types.ObjectId.isValid(prepId)) return NextResponse.json({ error: "Invalid prepId" }, { status: 400 });
  const list = (await InterviewSession.find({ userId, prepId }).sort({ createdAt: -1 }).limit(20).select("stage status mode wrappedUp targetQuestions transcript reviews feedback.overallScore feedback.verdict createdAt finishedAt").lean()) as unknown as (SessionLike & { feedback?: { overallScore?: number; verdict?: string } })[];
  return NextResponse.json({
    ok: true,
    sessions: list.map((s) => ({ sessionId: String(s._id), stage: s.stage, status: s.status, mode: s.mode || "chat", asked: askedOf(s), targetQuestions: s.targetQuestions, overallScore: s.feedback?.overallScore ?? null, verdict: s.feedback?.verdict ?? "", startedAt: s.createdAt, finishedAt: s.finishedAt || null })),
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
    const prep = (await InterviewPrep.findOne({ _id: prepId, userId }).lean()) as unknown as PrepLite | null;
    if (!prep) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // The interviewer's knowledge: the plan's company section + live catalog signals (no website fetch here — keep the start snappy).
    const ctx = await gatherCompanyContext(prep.company, { fetchWebsite: false }).catch(() => null);
    const cachedResearch = (await CompanyBrief.findOne({ key: String(prep.company || "").toLowerCase() }).lean().catch(() => null)) as unknown as { brief?: Parameters<typeof researchToText>[0] } | null;
    // The questions this company really asks (our candidates' reports + the web harvest, run now when due); they go into the prompt as their own block.
    const real = await realQuestionsForInterview(prep.company, stage, { domain: ctx?.domain, sampleTitles: ctx?.sampleTitles, harvest: process.env.NODE_ENV !== "test" });
    const companyBrief = buildCompanyBrief(prep.plan, ctx, cachedResearch?.brief ? researchToText(cachedResearch.brief) : null, null);
    const resumeText = await resumeTextFor(userId);
    const job = { title: prep.jobTitle, company: prep.company };
    const memory = await loadCoachMemory(userId);
    const style = pickStyle(stage);
    const posting = await postingFor(prep.source, prep.jobId);
    const first = await interviewerTurn({ plan: prep.plan, stage, job, companyBrief, resumeText, language, targetQuestions, transcript: [], coachMemory: memoryToText(memory) || undefined, retest: retestItems(memory, stage), style, codeTask: { allowed: CODE_STAGES.has(stage), done: false }, realQuestions: real, ...posting });
    const session = await InterviewSession.create({
      userId, prepId, jobId: prep.jobId, source: prep.source, jobTitle: prep.jobTitle, company: prep.company, stage, language, targetQuestions, companyBrief, persona: style,
      realQuestions: { text: real.text, count: real.count, stageCount: real.stageCount, harvest: real.harvest },
      transcript: [{ role: "interviewer", content: first.message, kind: "main" }],
    });
    return NextResponse.json({ ok: true, session: publicSession(session.toObject() as SessionLike) });
  } catch (err: unknown) {
    console.error("❌ interview session start:", err);
    return NextResponse.json({ error: errMsg(err) || "Could not start the interview" }, { status: 500 });
  }
}

/**
 * PATCH { sessionId, answer } → the candidate answers; returns the interviewer's next message (and whether the interview wrapped up).
 * PATCH { sessionId, codeSubmitted: true } → the coding exercise was handed in on /practice: its solution and grade become the candidate's turn.
 */
export async function PATCH(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const sessionId = String(body?.sessionId || "");
  let answer = String(body?.answer || "").trim().slice(0, MAX_ANSWER);
  const codeSubmitted = body?.codeSubmitted === true;
  if (!mongoose.Types.ObjectId.isValid(sessionId)) return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 });
  if (!answer && !codeSubmitted) return NextResponse.json({ error: "Empty answer" }, { status: 400 });
  // Every turn is an LLM call: capped per day like the session start.
  try {
    await consumeQuota(userId, "interview_turn");
  } catch (e) {
    const q = quotaResponse(e);
    if (q) return q;
    throw e;
  }

  try {
    await connectToDatabase();
    const session = await InterviewSession.findOne({ _id: sessionId, userId }).select("+realQuestions.text");
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (session.status !== "active" || session.wrappedUp) return NextResponse.json({ error: "This interview is over — ask for the feedback." }, { status: 409 });
    const prep = (await InterviewPrep.findById(session.prepId).lean()) as unknown as PrepLite | null;
    if (!prep) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

    if (codeSubmitted) {
      if (session.codeTask?.status !== "open") return NextResponse.json({ error: "No coding exercise is open in this interview." }, { status: 409 });
      const attempt = (await PracticeAttempt.findOne({ _id: session.codeTask.attemptId, userId }).lean()) as unknown as AttemptLite | null;
      if (!attempt || attempt.status === "in_progress") return NextResponse.json({ error: "The exercise has not been handed in yet.", pending: true }, { status: 409 });
      const task = (await PracticeTask.findById(session.codeTask.taskId).select("title").lean()) as unknown as { title?: string } | null;
      answer = codeSubmittedTurn(task, attempt);
      session.codeTask.status = "done";
      session.codeTask.score = attempt.score ?? null;
      session.codeTask.verdict = attempt.verdict || "";
    }

    session.transcript.push({ role: "candidate", content: answer });
    const transcript: SessionTurn[] = (session.transcript as Turn[]).map((t) => ({ role: t.role, content: t.content, ...(t.kind ? { kind: t.kind } : {}) }));
    const resumeText = await resumeTextFor(userId);
    const memory = await loadCoachMemory(userId);
    // Adaptive difficulty: the live per-answer reviews (written in the background after each turn).
    const liveScores = [...((session.reviews || []) as Review[])].sort((a, b) => a.index - b.index).map((r) => Number(r.score)).filter((n) => Number.isFinite(n));
    const codeTask = { allowed: CODE_STAGES.has(session.stage) && (session.mode || "chat") === "chat", done: session.codeTask?.status === "done", title: session.codeTask?.title, score: session.codeTask?.score ?? null };
    const posting = await postingFor(session.source, session.jobId);
    const turn = await interviewerTurn({ plan: prep.plan, stage: session.stage, job: { title: session.jobTitle, company: session.company }, companyBrief: session.companyBrief, resumeText, language: session.language, targetQuestions: session.targetQuestions, transcript, coachMemory: memoryToText(memory) || undefined, retest: retestItems(memory, session.stage), style: isStyle(session.persona) ? session.persona : undefined, liveScores, codeTask, realQuestions: session.realQuestions?.text ? { text: session.realQuestions.text, count: session.realQuestions.count, stageCount: session.realQuestions.stageCount } : undefined, ...posting });
    let message = turn.message;
    if (turn.codeTask && !session.codeTask?.status) {
      const handed = await handOutCodeTask(session, userId, prep.plan?.roleSummary || "").catch((e: unknown) => {
        console.warn("[interview] code task not handed out:", errMsg(e));
        return null;
      });
      if (handed) session.codeTask = { attemptId: handed.attemptId, taskId: handed.taskId, title: handed.title, timeLimitMin: handed.timeLimitMin, status: "open", score: null, verdict: "" };
      else message += session.language === "en" ? "\n\n(The exercise isn't available right now — let's continue with questions.)" : "\n\n(התרגיל לא זמין כרגע — נמשיך בשאלות.)";
    }
    // Safety net: whatever the model does, the interview ends a couple of main questions past its budget
    // (follow-ups and clarifications, marked by the interviewer, are not main questions).
    const askedNow = mainQuestionsAsked(session.transcript as Turn[]) + (turn.followUp ? 0 : 1); // includes the opening and this turn
    if (!turn.done && askedNow > session.targetQuestions + 2) {
      message = `${message}\n\n${session.language === "en" ? "That's all the time we have — thank you, we'll be in touch." : "זה כל מה שהספקנו — תודה רבה, נהיה בקשר."}`;
      turn.done = true;
    }
    session.transcript.push({ role: "interviewer", content: message, kind: turn.followUp && !turn.done ? "followup" : "main" });
    if (turn.done) session.wrappedUp = true;
    await session.save();
    // One step behind the conversation: review the new answer now; write the whole debrief once the interviewer said goodbye.
    const id = String(session._id);
    background(() => (session.wrappedUp ? generateAndStoreFeedback(id) : reviewPendingAnswers(id)));
    return NextResponse.json({ ok: true, message, done: turn.done, session: publicSession(session.toObject() as SessionLike) });
  } catch (err: unknown) {
    console.error("❌ interview session turn:", err);
    return NextResponse.json({ error: errMsg(err) || "The interviewer did not answer" }, { status: 500 });
  }
}
