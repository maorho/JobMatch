import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import User from "@/app/models/User";
import InterviewPrep from "@/app/models/InterviewPrep";
import InterviewSession from "@/app/models/InterviewSession";
import { finalFeedback, type SessionTurn } from "@/app/lib/interview/simulator";
import { computeDelivery, describeDelivery } from "@/app/lib/interview/voice";
import { structuredToText, isStructuredResume } from "@/app/lib/resume/structuredToText";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST { sessionId } → end the interview (if still running) and return the full feedback. Idempotent. */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const sessionId = String(body?.sessionId || "");
  if (!mongoose.Types.ObjectId.isValid(sessionId)) return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 });

  try {
    await connectToDatabase();
    const session: any = await InterviewSession.findOne({ _id: sessionId, userId });
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (session.feedback) return NextResponse.json({ ok: true, cached: true, feedback: session.feedback });
    const answered = session.transcript.filter((t: any) => t.role === "candidate").length;
    if (answered === 0) return NextResponse.json({ error: "Answer at least one question before asking for feedback." }, { status: 400 });

    const prep: any = await InterviewPrep.findById(session.prepId).lean();
    if (!prep) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    const user: any = await User.findById(userId).select("+resumeText +resumeStructured").lean();
    const resumeText = (user?.resumeText || "").trim() || (isStructuredResume(user?.resumeStructured) ? structuredToText(user.resumeStructured) : "");
    const transcript: SessionTurn[] = session.transcript.map((t: any) => ({ role: t.role, content: t.content }));
    let deliveryNote: string | undefined;
    if (session.mode === "voice") {
      const delivery = computeDelivery(session.transcript.map((t: any) => ({ role: t.role, content: t.content, seconds: t.seconds, prosody: t.prosody })), session.impression);
      session.delivery = delivery;
      deliveryNote = describeDelivery(delivery, session.language);
    }
    const feedback = await finalFeedback({ plan: prep.plan, stage: session.stage, job: { title: session.jobTitle, company: session.company }, companyBrief: session.companyBrief, resumeText, language: session.language, transcript, deliveryNote });

    session.feedback = feedback;
    session.status = "finished";
    session.wrappedUp = true;
    session.finishedAt = new Date();
    await session.save();
    return NextResponse.json({ ok: true, cached: false, feedback, delivery: session.delivery || null });
  } catch (err: any) {
    console.error("❌ interview feedback:", err);
    return NextResponse.json({ error: err?.message || "Could not write the feedback" }, { status: 500 });
  }
}
