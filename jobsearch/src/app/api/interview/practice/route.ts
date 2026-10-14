import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import User from "@/app/models/User";
import InterviewPrep from "@/app/models/InterviewPrep";
import { practiceReply, STAGE_KEYS, type StageKey, type PracticeTurn } from "@/app/lib/interview/prepare";
import { consumeQuota, quotaResponse } from "@/app/lib/ops/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST { prepId, stage, transcript: [{role, content}], language? }
 * One turn of a mock interview for a stage of the user's plan. Stateless:
 * the client keeps the transcript (bounded here to protect cost).
 */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const prepId = String(body?.prepId || "");
  const stage = (STAGE_KEYS as readonly string[]).includes(body?.stage) ? (body.stage as StageKey) : "hr";
  const transcript: PracticeTurn[] = Array.isArray(body?.transcript)
    ? body.transcript.filter((t: any) => (t?.role === "user" || t?.role === "assistant") && typeof t?.content === "string").map((t: any) => ({ role: t.role, content: String(t.content).slice(0, 4000) })).slice(-30)
    : [];
  if (!mongoose.Types.ObjectId.isValid(prepId)) return NextResponse.json({ error: "Invalid prepId" }, { status: 400 });
  // Daily cap on this paid action (lib/ops/quota.ts); 429 with a hint when spent.
  try {
    await consumeQuota(userId, "practice_turn");
  } catch (e) {
    const q = quotaResponse(e);
    if (q) return q;
    throw e;
  }

  try {
    await connectToDatabase();
    const prep: any = await InterviewPrep.findOne({ _id: prepId, userId }).lean();
    if (!prep) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const user: any = await User.findById(userId).select("+resumeText").lean();
    const reply = await practiceReply({
      plan: prep.plan,
      stage,
      job: { title: prep.jobTitle, company: prep.company },
      resumeText: user?.resumeText,
      transcript,
      language: body?.language === "en" ? "en" : "he",
    });
    return NextResponse.json({ ok: true, reply });
  } catch (err: any) {
    console.error("❌ interview practice:", err);
    return NextResponse.json({ error: err?.message || "Practice failed" }, { status: 500 });
  }
}
