import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import InterviewSession from "@/app/models/InterviewSession";
import { generateAndStoreFeedback, waitForFeedback } from "@/app/lib/interview/feedbackJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST { sessionId } → the full debrief. Usually instant: the per-answer
 * reviews were written during the interview and the debrief started the
 * moment the interviewer said goodbye. Otherwise it is generated here.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const sessionId = String(body?.sessionId || "");
  if (!mongoose.Types.ObjectId.isValid(sessionId)) return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 });

  try {
    await connectToDatabase();
    const session: any = await InterviewSession.findOne({ _id: sessionId, userId }).select("feedback delivery transcript").lean();
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (session.feedback) return NextResponse.json({ ok: true, cached: true, feedback: session.feedback, delivery: session.delivery || null });
    const answered = session.transcript.filter((t: any) => t.role === "candidate").length;
    if (answered === 0) return NextResponse.json({ error: "Answer at least one question before asking for feedback." }, { status: 400 });

    // Already being written in the background? Wait for it instead of paying twice.
    let feedback = await generateAndStoreFeedback(sessionId);
    if (!feedback) feedback = await waitForFeedback(sessionId);
    if (!feedback) feedback = await generateAndStoreFeedback(sessionId, { force: true });
    if (!feedback) return NextResponse.json({ error: "Could not write the feedback" }, { status: 500 });
    const fresh: any = await InterviewSession.findById(sessionId).select("delivery").lean();
    return NextResponse.json({ ok: true, cached: false, feedback, delivery: fresh?.delivery || null });
  } catch (err: any) {
    console.error("❌ interview feedback:", err);
    // The raw model/parse error ("Expected ',' or ']' … in JSON") is for the log, not the candidate.
    return NextResponse.json({ error: "המשוב לא נכתב הפעם. נסה/י שוב בעוד רגע — הראיון עצמו נשמר." }, { status: 500 });
  }
}
