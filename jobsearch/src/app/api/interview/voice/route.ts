import { NextRequest, NextResponse, after } from "next/server";
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
import { buildCompanyBrief } from "@/app/lib/interview/simulator";
import { buildVoiceInstructions, createRealtimeClientSecret, computeDelivery, pickVoice, REALTIME_MODEL } from "@/app/lib/interview/voice";
import { reviewPendingAnswers, generateAndStoreFeedback } from "@/app/lib/interview/feedbackJob";

/** Run work after the response is sent (Next `after`); inline when outside a request scope (tests). */
function background(fn: () => Promise<unknown>) {
  if (process.env.NODE_ENV === "test") return; // tests drive these jobs explicitly
  try {
    after(() => fn().catch((e) => console.warn("[interview] background job failed:", e?.message)));
  } catch {
    void fn().catch((e) => console.warn("[interview] background job failed:", e?.message));
  }
}
import { structuredToText, isStructuredResume } from "@/app/lib/resume/structuredToText";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST { prepId, stage, language?, questions? } → a voice session: the
 * interviewer's instructions are compiled server-side (company brief, résumé,
 * stage persona) and baked into a short-lived Realtime client secret. The
 * browser connects to OpenAI with it; audio never passes through us.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const prepId = String(body?.prepId || "");
  const stage = (STAGE_KEYS as readonly string[]).includes(body?.stage) ? (body.stage as StageKey) : "hr";
  const language = body?.language === "en" ? "en" : "he";
  const targetQuestions = Math.min(Math.max(parseInt(body?.questions, 10) || 6, 3), 12);
  if (!mongoose.Types.ObjectId.isValid(prepId)) return NextResponse.json({ error: "Invalid prepId" }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Voice interviews are not configured on this server (OPENAI_API_KEY)." }, { status: 503 });

  try {
    await connectToDatabase();
    const prep: any = await InterviewPrep.findOne({ _id: prepId, userId }).lean();
    if (!prep) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const [ctx, user]: [any, any] = await Promise.all([gatherCompanyContext(prep.company, { fetchWebsite: false }).catch(() => null), User.findById(userId).select("+resumeText +resumeStructured").lean()]);
    const cachedResearch: any = await CompanyBrief.findOne({ key: String(prep.company || "").toLowerCase() }).lean().catch(() => null);
    const companyBrief = buildCompanyBrief(prep.plan, ctx, cachedResearch?.brief ? researchToText(cachedResearch.brief) : null);
    const resumeText = (user?.resumeText || "").trim() || (isStructuredResume(user?.resumeStructured) ? structuredToText(user.resumeStructured) : "");
    const who = pickVoice();
    const instructions = buildVoiceInstructions({ plan: prep.plan, stage, job: { title: prep.jobTitle, company: prep.company }, companyBrief, resumeText, language, targetQuestions, transcript: [], interviewer: { name: who.name, gender: who.gender } });
    const secret = await createRealtimeClientSecret({ instructions, language, voice: who.voice });

    const session = await InterviewSession.create({
      userId, prepId, jobId: prep.jobId, source: prep.source, jobTitle: prep.jobTitle, company: prep.company, stage, language, targetQuestions, companyBrief,
      mode: "voice", realtime: { model: secret.model, voice: secret.voice, name: who.name, gender: who.gender }, transcript: [],
    });
    return NextResponse.json({
      ok: true,
      sessionId: String(session._id),
      clientSecret: secret.value,
      expiresAt: secret.expiresAt,
      model: secret.model,
      voice: secret.voice,
      interviewer: { name: who.name, gender: who.gender },
      endpoint: secret.endpoint,
      targetQuestions,
      stage,
    });
  } catch (err: any) {
    console.error("❌ voice session start:", err);
    return NextResponse.json({ error: err?.message || "Could not start the voice interview" }, { status: 500 });
  }
}

/**
 * PATCH { sessionId, turns: [{role, content, seconds?}], wrappedUp? } → the
 * browser's running transcript replaces ours (idempotent), so nothing is
 * lost if the tab dies mid-call.
 */
export async function PATCH(req: NextRequest) {
  // The phone bridge (server/phone.ts) writes transcripts with the service token instead of a user cookie.
  const service = !!process.env.CRON_SECRET && (req.headers.get("x-service-token") || "") === process.env.CRON_SECRET;
  const userId = service ? null : await getUserIdFromRequest(req);
  if (!service && !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const sessionId = String(body?.sessionId || "");
  if (!mongoose.Types.ObjectId.isValid(sessionId)) return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 });
  const turns = Array.isArray(body?.turns)
    ? body.turns
        .filter((t: any) => (t?.role === "interviewer" || t?.role === "candidate") && typeof t?.content === "string" && t.content.trim())
        .slice(0, 200)
        .map((t: any) => ({
          role: t.role,
          content: String(t.content).trim().slice(0, 6000),
          seconds: Number.isFinite(Number(t.seconds)) ? Math.max(0, Math.min(600, Number(t.seconds))) : undefined,
          prosody: t.prosody && typeof t.prosody === "object" ? cleanProsody(t.prosody) : undefined,
        }))
    : [];
  const impression = body?.impression && typeof body.impression === "object" ? cleanImpression(body.impression) : undefined;
  await connectToDatabase();
  const session: any = await InterviewSession.findOne({ _id: sessionId, ...(userId ? { userId } : {}), mode: "voice" });
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.status === "finished") return NextResponse.json({ ok: true, frozen: true });
  session.transcript = turns;
  if (body?.wrappedUp === true) session.wrappedUp = true;
  if (impression) session.impression = impression;
  session.delivery = computeDelivery(turns, session.impression);
  await session.save();
  // Keep the debrief one step behind the conversation: review the new
  // answers now; when the interviewer has said goodbye, write the whole thing.
  const id = String(session._id);
  background(() => (session.wrappedUp ? generateAndStoreFeedback(id) : reviewPendingAnswers(id)));
  return NextResponse.json({ ok: true, turns: turns.length, wrappedUp: !!session.wrappedUp, delivery: session.delivery, reviews: (session.reviews || []).length });
}

const num = (v: unknown, lo: number, hi: number) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : 0);
function cleanProsody(p: any) {
  return {
    pitchMedianHz: num(p.pitchMedianHz, 0, 1000),
    pitchVarSemitones: num(p.pitchVarSemitones, 0, 24),
    loudnessDb: num(p.loudnessDb, -100, 0),
    loudnessVarDb: num(p.loudnessVarDb, 0, 60),
    pauseRatio: num(p.pauseRatio, 0, 1),
    endTrendDb: num(p.endTrendDb, -60, 60),
    voicedFrames: num(p.voicedFrames, 0, 100000),
  };
}
function cleanImpression(i: any) {
  const pace = ["too slow", "good", "too fast", "uneven"].includes(i.pace) ? i.pace : "good";
  return { confidence: num(i.confidence, 1, 5), energy: num(i.energy, 1, 5), clarity: num(i.clarity, 1, 5), warmth: num(i.warmth, 1, 5), pace, notes: String(i.notes || "").slice(0, 600) };
}

/** Model/voice in use (for the UI). */
export async function GET() {
  return NextResponse.json({ ok: true, configured: !!process.env.OPENAI_API_KEY, model: REALTIME_MODEL });
}
