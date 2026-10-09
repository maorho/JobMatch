import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import InterviewPrep from "@/app/models/InterviewPrep";
import InterviewSession from "@/app/models/InterviewSession";
import { finalFeedback, reviewAnswer, type AnswerReview, type SessionTurn, type InterviewFeedback } from "./simulator";
import { computeDelivery, describeDelivery } from "./voice";
import { structuredToText, isStructuredResume } from "@/app/lib/resume/structuredToText";

/**
 * Background work that makes the debrief instant: while the interview runs,
 * every answered question is reviewed as soon as its answer lands; when the
 * interviewer says goodbye, the final debrief is generated right away so
 * it is (usually) already stored by the time the candidate asks for it.
 */
const FEEDBACK_LOCK_MS = 120_000;

async function resumeTextFor(userId: string): Promise<string> {
  const user: any = await User.findById(userId).select("+resumeText +resumeStructured").lean();
  return (user?.resumeText || "").trim() || (isStructuredResume(user?.resumeStructured) ? structuredToText(user.resumeStructured) : "");
}

/** The question/answer pairs in a transcript: each candidate turn with the interviewer turn right before it. */
export function pairQuestions(transcript: SessionTurn[]): { index: number; question: string; answer: string }[] {
  const out: { index: number; question: string; answer: string }[] = [];
  for (let i = 0; i < transcript.length; i++) {
    const t = transcript[i];
    if (t.role !== "candidate") continue;
    const prev = [...transcript.slice(0, i)].reverse().find((x) => x.role === "interviewer");
    if (!prev) continue;
    out.push({ index: i, question: prev.content, answer: t.content });
  }
  return out;
}

/** Guess the interview language from what the candidate actually said. */
export function detectLanguage(transcript: SessionTurn[], fallback: "he" | "en"): "he" | "en" {
  const text = transcript.filter((t) => t.role === "candidate").map((t) => t.content).join(" ");
  if (text.length < 20) return fallback;
  const he = (text.match(/[֐-׿]/g) || []).length;
  const lat = (text.match(/[A-Za-z]/g) || []).length;
  return he >= lat ? "he" : "en";
}

/** Review answers that don't have a review yet. Skips tiny answers (intro, "yes"). */
export async function reviewPendingAnswers(sessionId: string): Promise<number> {
  await connectToDatabase();
  const session: any = await InterviewSession.findById(sessionId);
  if (!session || session.status === "finished") return 0;
  const transcript: SessionTurn[] = session.transcript.map((t: any) => ({ role: t.role, content: t.content }));
  const done = new Set<number>((session.reviews || []).map((r: any) => r.index));
  const pending = pairQuestions(transcript).filter((p) => !done.has(p.index) && p.answer.split(/\s+/).length >= 6);
  if (!pending.length) return 0;
  const resumeText = await resumeTextFor(String(session.userId));
  const language = detectLanguage(transcript, session.language);
  let n = 0;
  for (const p of pending) {
    try {
      const r = await reviewAnswer({ question: p.question, answer: p.answer, job: { title: session.jobTitle, company: session.company }, stage: session.stage, resumeText, language });
      await InterviewSession.updateOne({ _id: sessionId, "reviews.index": { $ne: p.index } }, { $push: { reviews: { index: p.index, ...r } } });
      n++;
    } catch (e) {
      console.warn("[interview] answer review skipped:", (e as Error)?.message);
    }
  }
  return n;
}

/**
 * Generate and store the debrief once. A lock (feedbackStartedAt) stops the
 * PATCH-triggered background run and the finish route from both paying for it.
 */
export async function generateAndStoreFeedback(sessionId: string, opts: { force?: boolean } = {}): Promise<InterviewFeedback | null> {
  await connectToDatabase();
  const now = new Date();
  const claimed: any = await InterviewSession.findOneAndUpdate(
    { _id: sessionId, feedback: { $exists: false }, ...(opts.force ? {} : { $or: [{ feedbackStartedAt: { $exists: false } }, { feedbackStartedAt: { $lt: new Date(now.getTime() - FEEDBACK_LOCK_MS) } }] }) },
    { $set: { feedbackStartedAt: now } },
    { new: true }
  );
  if (!claimed) {
    const s: any = await InterviewSession.findById(sessionId).select("feedback").lean();
    return s?.feedback || null;
  }
  const answered = claimed.transcript.filter((t: any) => t.role === "candidate").length;
  if (answered === 0) return null;
  const prep: any = await InterviewPrep.findById(claimed.prepId).lean();
  if (!prep) return null;
  const transcript: SessionTurn[] = claimed.transcript.map((t: any) => ({ role: t.role, content: t.content }));
  // Make sure every answer has its review first (cheap), so the big call stays small.
  await reviewPendingAnswers(sessionId).catch(() => 0);
  const fresh: any = await InterviewSession.findById(sessionId).select("reviews impression language mode").lean();
  const priorReviews: AnswerReview[] = (fresh?.reviews || []).sort((a: any, b: any) => a.index - b.index).map(({ index: _i, ...r }: any) => r);
  const resumeText = await resumeTextFor(String(claimed.userId));
  const language = detectLanguage(transcript, claimed.language);
  let deliveryNote: string | undefined;
  let delivery: any;
  if (claimed.mode === "voice") {
    delivery = computeDelivery(claimed.transcript.map((t: any) => ({ role: t.role, content: t.content, seconds: t.seconds, prosody: t.prosody })), fresh?.impression);
    deliveryNote = describeDelivery(delivery, language);
  }
  const feedback = await finalFeedback({ plan: prep.plan, stage: claimed.stage, job: { title: claimed.jobTitle, company: claimed.company }, companyBrief: claimed.companyBrief, resumeText, language, transcript, deliveryNote, priorReviews: priorReviews.length ? priorReviews : undefined });
  await InterviewSession.updateOne({ _id: sessionId }, { $set: { feedback, status: "finished", wrappedUp: true, finishedAt: new Date(), language, ...(delivery ? { delivery } : {}) } });
  return feedback;
}

/** Wait (briefly) for a debrief another process is already writing. */
export async function waitForFeedback(sessionId: string, maxMs = 45_000): Promise<InterviewFeedback | null> {
  const until = Date.now() + maxMs;
  while (Date.now() < until) {
    const s: any = await InterviewSession.findById(sessionId).select("feedback feedbackStartedAt").lean();
    if (s?.feedback) return s.feedback;
    if (!s?.feedbackStartedAt || Date.now() - new Date(s.feedbackStartedAt).getTime() > FEEDBACK_LOCK_MS) return null;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}
