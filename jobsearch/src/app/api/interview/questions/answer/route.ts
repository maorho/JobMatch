import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { consumeQuota, quotaResponse } from "@/app/lib/ops/quota";
import { suggestAnswer } from "@/app/lib/interview/suggestedAnswer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST { company, question, stage?, topic? } → a model answer to that company
 * interview question written from the caller's résumé. Cached per résumé
 * version; the daily quota is charged only when the model is actually called.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const company = String(body?.company || "").trim().slice(0, 120);
  const question = String(body?.question || "").trim().slice(0, 600);
  if (!company || question.length < 5) return NextResponse.json({ error: "Missing company or question" }, { status: 400 });

  try {
    const r = await suggestAnswer({
      userId,
      company,
      question,
      stage: typeof body?.stage === "string" ? body.stage.slice(0, 40) : undefined,
      topic: typeof body?.topic === "string" ? body.topic.slice(0, 80) : undefined,
      onCacheMiss: async () => {
        await consumeQuota(userId, "question_answer");
      },
    });
    if (!r.ok) {
      if (r.reason === "NO_RESUME") return NextResponse.json({ error: "NO_RESUME", message: "אין עדיין קורות חיים במערכת — העלה/י או בנה/י אותם ב-ResumeAI כדי לקבל תשובה מותאמת." }, { status: 409 });
      return NextResponse.json({ error: "NO_LLM", message: "הכנת תשובות אינה זמינה כרגע." }, { status: 503 });
    }
    return NextResponse.json(r);
  } catch (e) {
    const q = quotaResponse(e);
    if (q) return q;
    console.error("[questions/answer]", e);
    return NextResponse.json({ error: "answer_failed", message: "לא הצלחנו להכין תשובה כרגע. נסה/י שוב בעוד רגע." }, { status: 500 });
  }
}
