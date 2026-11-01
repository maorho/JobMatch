import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { PRIVATE_CACHE } from "@/app/lib/cache";
import { tasksFor, suggestRoleAndLevel, listAttempts, newTask } from "@/app/lib/practice/attempts";
import { isRole, isLevel, isKind, PRACTICE_ROLES, PRACTICE_LEVELS, ROLE_INFO, LEVEL_HE, codingMinutes, assignmentHours } from "@/app/lib/practice/roles";
import { consumeQuota, quotaResponse } from "@/app/lib/ops/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/practice/tasks?role=&level=
 * The practice catalogue for a role × level (defaults: inferred from the
 * résumé). When a kind has fewer than 3 tasks the Examiner / Assigner write
 * more before answering, so the first visit can take ~10–20s.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const suggested = await suggestRoleAndLevel(userId);
  const role = isRole(sp.get("role")) ? (sp.get("role") as any) : suggested.role;
  const level = isLevel(sp.get("level")) ? (sp.get("level") as any) : suggested.level;
  try {
    const [tasks, mine] = await Promise.all([tasksFor(role, level, { userId }), listAttempts(userId, 100)]);
    const open = new Map(mine.attempts.filter((a) => a.status === "in_progress").map((a) => [String(a.taskId), String(a._id)]));
    const strip = (t: any) => ({ _id: String(t._id), done: !!t.done, kind: t.kind, role: t.role, level: t.level, title: t.title, excerpt: String(t.prompt || "").split(/\n\n/)[0].slice(0, 180), language: t.language, tags: t.tags, difficulty: t.difficulty, timeLimitMin: t.timeLimitMin, estimatedHours: t.estimatedHours, deliverables: (t.deliverables || []).length, attempts: t.stats?.attempts || 0, avgScore: t.stats?.graded ? Math.round(t.stats.scoreSum / t.stats.graded) : null, best: mine.stats.bestByTask[String(t._id)] ?? null, openAttemptId: open.get(String(t._id)) || null });
    return NextResponse.json(
      {
        role,
        level,
        suggested,
        roles: PRACTICE_ROLES.map((r) => ({ key: r, label: ROLE_INFO[r].he, codingMinutes: codingMinutes(r, level), assignmentHours: assignmentHours(r, level) })),
        levels: PRACTICE_LEVELS.map((l) => ({ key: l, label: LEVEL_HE[l] })),
        coding: tasks.filter((t) => t.kind === "coding").map(strip),
        assignments: tasks.filter((t) => t.kind === "assignment").map(strip),
        stats: mine.stats,
      },
      { headers: PRIVATE_CACHE }
    );
  } catch (err: any) {
    console.error("❌ practice tasks:", err);
    return NextResponse.json({ error: err?.message || "failed" }, { status: 500 });
  }
}

/**
 * POST /api/practice/tasks { kind, role?, level? } — "give me a new question":
 * the Examiner / Assigner writes one more task for the role × level, different
 * from everything already in the bank. Capped per day (practice_author).
 */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const kind = isKind(body?.kind) ? body.kind : "coding";
  const suggested = await suggestRoleAndLevel(userId);
  const role = isRole(body?.role) ? body.role : suggested.role;
  const level = isLevel(body?.level) ? body.level : suggested.level;
  try {
    await consumeQuota(userId, "practice_author");
  } catch (e) {
    const q = quotaResponse(e);
    if (q) return q;
    throw e;
  }
  try {
    const t = await newTask(kind, role, level);
    if (!t) return NextResponse.json({ ok: false, error: "לא הצלחתי לכתוב שאלה חדשה כרגע. נסו שוב בעוד רגע." }, { status: 503 });
    return NextResponse.json({ ok: true, task: { _id: String(t._id), kind: t.kind, title: t.title } }, { headers: PRIVATE_CACHE });
  } catch (err: any) {
    console.error("❌ practice new task:", err);
    return NextResponse.json({ error: err?.message || "failed" }, { status: 500 });
  }
}
