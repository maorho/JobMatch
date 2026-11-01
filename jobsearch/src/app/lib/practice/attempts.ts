import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import PracticeAttempt from "@/app/models/PracticeAttempt";
import PracticeTask from "@/app/models/PracticeTask";
import User from "@/app/models/User";
import { startFlow, processQueue } from "@/app/lib/agents";
import { inferCandidateLevel } from "@/app/lib/matcher/level";
import { structuredToText, isStructuredResume } from "@/app/lib/resume/structuredToText";
import { LATE_GRACE_SEC } from "./grade";
import { ensureTasks } from "./author";
import { inferRole, isLevel, type PracticeRole, type PracticeLevel, type TaskKind } from "./roles";

/** The attempt lifecycle: start (clock begins), submit (clock stops, flagged if late), grade (via the agents on the bus). */

export async function suggestRoleAndLevel(userId: string): Promise<{ role: PracticeRole; level: PracticeLevel }> {
  await connectToDatabase();
  const user: any = await User.findById(userId).select("+resumeText +resumeStructured currentJob level").lean();
  const resumeText = (user?.resumeText || "").trim() || (isStructuredResume(user?.resumeStructured) ? structuredToText(user.resumeStructured) : "");
  const level = isLevel(user?.level) ? user.level : inferCandidateLevel(resumeText, user?.currentJob || "");
  return { role: inferRole(`${user?.currentJob || ""}\n${resumeText}`), level };
}

/** How many tasks of a kind a person should always have waiting that they have not tried yet. */
export const FRESH_TASKS_MIN = 3;

/** Ask the agents (on the bus) for `count` more tasks of a kind, avoiding what the bank already has. */
async function authorMore(kind: TaskKind, role: PracticeRole, level: PracticeLevel, count: number) {
  const type = kind === "coding" ? "coding.author" : "assignment.author";
  const { runId } = await startFlow(type, { role, level, count }, { from: "user", title: `${kind === "coding" ? "Coding questions" : "Home assignments"}: ${role}/${level}`, says: `${kind === "coding" ? "Examiner" : "Assigner"} — we need ${count} more ${kind === "coding" ? "timed question" : "take-home"}${count === 1 ? "" : "s"} for a ${level} ${role}.` });
  await processQueue({ runId, budgetMs: 90_000 });
}

/** Ids of the tasks this person has handed in (any outcome): those should not be the only thing on offer. */
export async function attemptedTaskIds(userId: string): Promise<Set<string>> {
  await connectToDatabase();
  const rows: any[] = await PracticeAttempt.find({ userId, status: { $ne: "in_progress" } }).select("taskId").lean();
  return new Set(rows.map((r) => String(r.taskId)));
}

/**
 * Tasks for a role × level, making sure each kind has its floor and — when a
 * person is given — at least FRESH_TASKS_MIN they have not tried yet, so
 * someone who answered everything gets new questions, not the same ones.
 * Fresh tasks come first; answered ones follow, marked `done`.
 */
export async function tasksFor(role: PracticeRole, level: PracticeLevel, opts: { kinds?: TaskKind[]; author?: boolean; userId?: string } = {}) {
  await connectToDatabase();
  const kinds = opts.kinds || ["coding", "assignment"];
  const done = opts.userId ? await attemptedTaskIds(opts.userId) : new Set<string>();
  if (opts.author !== false) {
    for (const kind of kinds) {
      const ids: any[] = await PracticeTask.find({ kind, role, level, active: true }).select("_id").lean();
      const fresh = ids.filter((t) => !done.has(String(t._id))).length;
      const need = Math.max(3 - ids.length, FRESH_TASKS_MIN - fresh);
      if (need <= 0) continue;
      // Through the bus so the authoring shows up in the agents' conversation; processed right away.
      await authorMore(kind, role, level, Math.min(need, 3));
    }
  }
  const tasks: any[] = await PracticeTask.find({ role, level, active: true, kind: { $in: kinds } }).sort({ difficulty: 1, createdAt: 1 }).lean();
  const withDone = tasks.map((t) => ({ ...t, done: done.has(String(t._id)) }));
  return [...withDone.filter((t) => !t.done), ...withDone.filter((t) => t.done)];
}

/** One more task of a kind, on request ("a new question"). Returns the new task, or null when nothing could be authored. */
export async function newTask(kind: TaskKind, role: PracticeRole, level: PracticeLevel): Promise<any | null> {
  await connectToDatabase();
  const before: any[] = await PracticeTask.find({ kind, role, level, active: true }).select("_id").lean();
  const seen = new Set(before.map((t) => String(t._id)));
  await authorMore(kind, role, level, 1);
  const after: any[] = await PracticeTask.find({ kind, role, level, active: true }).sort({ createdAt: -1 }).limit(5).lean();
  return after.find((t) => !seen.has(String(t._id))) || null;
}

export async function startAttempt(userId: string, taskId: string): Promise<any | null> {
  await connectToDatabase();
  if (!mongoose.Types.ObjectId.isValid(taskId)) return null;
  const task: any = await PracticeTask.findById(taskId).lean();
  if (!task || !task.active) return null;
  const open: any = await PracticeAttempt.findOne({ userId, taskId, status: "in_progress" }).lean();
  if (open) return open;
  const ms = task.kind === "coding" ? task.timeLimitMin * 60_000 : task.estimatedHours * 3_600_000;
  const now = new Date();
  const attempt = await PracticeAttempt.create({ userId, taskId, kind: task.kind, role: task.role, level: task.level, startedAt: now, deadlineAt: new Date(now.getTime() + ms), language: task.language || "" });
  await PracticeTask.updateOne({ _id: task._id }, { $inc: { "stats.attempts": 1 } });
  return attempt.toObject();
}

/** Hand in. Late by more than the grace → `timedOut` (still graded). Then the owning agent grades it, right away. */
export async function submitAttempt(userId: string, attemptId: string, input: { answer: string; repoUrl?: string }, opts: { grade?: boolean } = {}): Promise<any | null> {
  await connectToDatabase();
  if (!mongoose.Types.ObjectId.isValid(attemptId)) return null;
  const attempt: any = await PracticeAttempt.findOne({ _id: attemptId, userId });
  if (!attempt) return null;
  if (attempt.status !== "in_progress") return attempt.toObject();
  const now = Date.now();
  attempt.answer = String(input.answer || "").slice(0, 60000);
  attempt.repoUrl = String(input.repoUrl || "").slice(0, 300);
  attempt.submittedAt = new Date(now);
  attempt.durationSec = Math.round((now - new Date(attempt.startedAt).getTime()) / 1000);
  attempt.timedOut = now > new Date(attempt.deadlineAt).getTime() + LATE_GRACE_SEC * 1000;
  attempt.status = "submitted";
  await attempt.save();
  if (opts.grade !== false) {
    const type = attempt.kind === "coding" ? "coding.grade" : "assignment.review";
    const { runId } = await startFlow(type, { attemptId: String(attempt._id), userId }, { from: "user", title: `${attempt.kind === "coding" ? "Grade" : "Review"}: ${attempt.role}/${attempt.level}`, says: attempt.kind === "coding" ? "Examiner — a submission just came in, please grade it." : "Assigner — a take-home was handed in, please review it." });
    await processQueue({ runId, budgetMs: 120_000 });
  }
  return (await PracticeAttempt.findById(attempt._id).lean()) as any;
}

export async function attemptForUser(userId: string, attemptId: string): Promise<{ attempt: any; task: any } | null> {
  await connectToDatabase();
  if (!mongoose.Types.ObjectId.isValid(attemptId)) return null;
  const attempt: any = await PracticeAttempt.findOne({ _id: attemptId, userId }).lean();
  if (!attempt) return null;
  const task: any = await PracticeTask.findById(attempt.taskId).lean();
  return { attempt, task };
}

export async function listAttempts(userId: string, limit = 50) {
  await connectToDatabase();
  const attempts: any[] = await PracticeAttempt.find({ userId }).sort({ createdAt: -1 }).limit(limit).select("-answer").lean();
  const tasks: any[] = await PracticeTask.find({ _id: { $in: attempts.map((a) => a.taskId) } }).select("title kind role level timeLimitMin estimatedHours difficulty").lean();
  const byId = new Map(tasks.map((t) => [String(t._id), t]));
  const rows = attempts.map((a) => ({ ...a, task: byId.get(String(a.taskId)) || null }));
  const graded = rows.filter((a) => a.status === "graded");
  const avg = (xs: any[]) => (xs.length ? Math.round(xs.reduce((s, a) => s + (a.score || 0), 0) / xs.length) : null);
  return {
    attempts: rows,
    stats: { total: rows.length, graded: graded.length, avgScore: avg(graded), coding: avg(graded.filter((a) => a.kind === "coding")), assignment: avg(graded.filter((a) => a.kind === "assignment")), passed: graded.filter((a) => a.verdict === "pass").length, bestByTask: Object.fromEntries(graded.reduce((m, a) => m.set(String(a.taskId), Math.max(m.get(String(a.taskId)) ?? 0, a.score || 0)), new Map<string, number>())) },
  };
}

export { ensureTasks };
