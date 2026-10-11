import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { PRIVATE_CACHE } from "@/app/lib/cache";
import { startAttempt, listAttempts } from "@/app/lib/practice/attempts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/practice/attempts — my history + progress. */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listAttempts(userId), { headers: PRIVATE_CACHE });
}

/** POST /api/practice/attempts { taskId } — start the clock (or return the open attempt on this task). */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const attempt = await startAttempt(userId, String(body.taskId || ""));
  if (!attempt) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json({ ok: true, attemptId: String(attempt._id), deadlineAt: attempt.deadlineAt, startedAt: attempt.startedAt }, { headers: PRIVATE_CACHE });
}
