import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { PRIVATE_CACHE } from "@/app/lib/cache";
import { attemptForUser } from "@/app/lib/practice/attempts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/practice/attempts/:id — the attempt with its task (hints only after submission). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const r = await attemptForUser(userId, id);
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { attempt, task } = r;
  const done = attempt.status !== "in_progress";
  return NextResponse.json(
    {
      attempt: { ...attempt, _id: String(attempt._id), taskId: String(attempt.taskId), userId: undefined },
      task: task ? { ...task, _id: String(task._id), hints: done ? task.hints : [], stats: undefined } : null,
      serverNow: new Date().toISOString(),
    },
    { headers: PRIVATE_CACHE }
  );
}
