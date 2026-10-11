import { NextRequest, NextResponse } from "next/server";
import { consumeQuota, quotaResponse } from "@/app/lib/ops/quota";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { PRIVATE_CACHE } from "@/app/lib/cache";
import { submitAttempt } from "@/app/lib/practice/attempts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST /api/practice/attempts/:id/submit { answer, repoUrl? } — hand in; the Examiner / Assigner grades before this returns. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Daily cap on this paid action (lib/ops/quota.ts); 429 with a hint when spent.
  try {
    await consumeQuota(userId, "practice_grade");
  } catch (e) {
    const q = quotaResponse(e);
    if (q) return q;
    throw e;
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const attempt = await submitAttempt(userId, id, { answer: String(body.answer || ""), repoUrl: body.repoUrl ? String(body.repoUrl) : "" });
    if (!attempt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, attempt: { ...attempt, _id: String(attempt._id), taskId: String(attempt.taskId), userId: undefined } }, { headers: PRIVATE_CACHE });
  } catch (err: any) {
    console.error("❌ practice submit:", err);
    return NextResponse.json({ error: err?.message || "failed" }, { status: 500 });
  }
}
