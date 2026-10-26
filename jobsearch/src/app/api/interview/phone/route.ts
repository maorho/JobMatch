import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import User from "@/app/models/User";
import InterviewPrep from "@/app/models/InterviewPrep";
import InterviewSession from "@/app/models/InterviewSession";
import CompanyBrief from "@/app/models/CompanyBrief";
import { STAGE_KEYS, type StageKey } from "@/app/lib/interview/prepare";
import { gatherCompanyContext } from "@/app/lib/interview/companyContext";
import { buildCompanyBrief } from "@/app/lib/interview/simulator";
import { researchToText } from "@/app/lib/interview/companyResearch";
import { reportedQuestionsText } from "@/app/lib/outcomes/questions";
import { buildVoiceInstructions, pickVoice, END_TOOL_DEF, SILENCE_MS, REALTIME_MODEL } from "@/app/lib/interview/voice";
import { phoneConfigured, toE164, placeCall, endCall } from "@/app/lib/interview/phone";
import { structuredToText, isStructuredResume } from "@/app/lib/resume/structuredToText";
import { loadCoachMemory, memoryToText } from "@/app/lib/interview/coachMemory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const serviceOk = (req: NextRequest) => {
  const t = req.headers.get("x-service-token") || "";
  return !!process.env.CRON_SECRET && t === process.env.CRON_SECRET;
};

/**
 * POST { prepId, stage, questions?, phone? } → the interviewer calls the candidate.
 * Creates a voice session (channel "phone") with the compiled instructions
 * stored for the bridge, then asks Twilio to place the call.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!phoneConfigured()) return NextResponse.json({ error: "Phone interviews are not configured on this server (Twilio)." }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const prepId = String(body?.prepId || "");
  const stage = (STAGE_KEYS as readonly string[]).includes(body?.stage) ? (body.stage as StageKey) : "hr";
  const targetQuestions = Math.min(Math.max(parseInt(body?.questions, 10) || 6, 3), 12);
  if (!mongoose.Types.ObjectId.isValid(prepId)) return NextResponse.json({ error: "Invalid prepId" }, { status: 400 });

  try {
    await connectToDatabase();
    const [prep, user]: [any, any] = await Promise.all([InterviewPrep.findOne({ _id: prepId, userId }).lean(), User.findById(userId).select("+resumeText +resumeStructured phone").lean()]);
    if (!prep) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const to = toE164(String(body?.phone || user?.phone || ""));
    if (!to) return NextResponse.json({ error: "מספר טלפון לא תקין" }, { status: 400 });

    const [ctx, cachedResearch]: [any, any] = await Promise.all([gatherCompanyContext(prep.company, { fetchWebsite: false }).catch(() => null), CompanyBrief.findOne({ key: String(prep.company || "").toLowerCase() }).lean().catch(() => null)]);
    const companyBrief = buildCompanyBrief(prep.plan, ctx, cachedResearch?.brief ? researchToText(cachedResearch.brief) : null, await reportedQuestionsText(prep.company, { limit: 12 }).catch(() => ""));
    const resumeText = (user?.resumeText || "").trim() || (isStructuredResume(user?.resumeStructured) ? structuredToText(user.resumeStructured) : "");
    const who = pickVoice();
    const instructions = buildVoiceInstructions({ plan: prep.plan, stage, job: { title: prep.jobTitle, company: prep.company }, companyBrief, resumeText, language: "he", targetQuestions, transcript: [], interviewer: { name: who.name, gender: who.gender }, coachMemory: memoryToText(await loadCoachMemory(userId)) || undefined }) + "\n\nTHIS IS A PHONE CALL: audio quality is lower — speak a little slower and clearer, confirm when you didn't catch something.";

    const session = await InterviewSession.create({
      userId, prepId, jobId: prep.jobId, source: prep.source, jobTitle: prep.jobTitle, company: prep.company, stage, language: "he", targetQuestions, companyBrief,
      mode: "voice", channel: "phone", phone: to, instructions, realtime: { model: REALTIME_MODEL, voice: who.voice, name: who.name, gender: who.gender }, transcript: [],
    });
    const call = await placeCall({ to, sessionId: String(session._id) });
    await InterviewSession.updateOne({ _id: session._id }, { $set: { callSid: call.sid } });
    return NextResponse.json({ ok: true, sessionId: String(session._id), callSid: call.sid, to, interviewer: { name: who.name, gender: who.gender } });
  } catch (err: any) {
    console.error("❌ phone interview start:", err);
    return NextResponse.json({ error: err?.message || "Could not place the call" }, { status: 500 });
  }
}

/** GET ?id= (service token) → what the bridge needs to run the call. */
export async function GET(req: NextRequest) {
  if (!serviceOk(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  await connectToDatabase();
  const s: any = await InterviewSession.findById(id).select("+instructions channel status realtime callSid").lean();
  if (!s || s.channel !== "phone" || s.status === "finished") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, instructions: s.instructions, model: s.realtime?.model || REALTIME_MODEL, voice: s.realtime?.voice, tools: [END_TOOL_DEF], silenceMs: SILENCE_MS, callSid: s.callSid || "" });
}

/** DELETE { sessionId } (service token or owner) → hang up the Twilio call. */
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sessionId = String(body?.sessionId || "");
  if (!mongoose.Types.ObjectId.isValid(sessionId)) return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 });
  await connectToDatabase();
  const userId = serviceOk(req) ? null : await getUserIdFromRequest(req);
  const s: any = await InterviewSession.findOne({ _id: sessionId, ...(userId ? { userId } : {}) }).select("callSid").lean();
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (s.callSid && phoneConfigured()) await endCall(s.callSid);
  return NextResponse.json({ ok: true });
}
