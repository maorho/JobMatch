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

/** Tasks for a role × level, making sure each kind has its floor (authored by the agents when missing). */
export async function tasksFor(role: PracticeRole, level: PracticeLevel, opts: { kinds?: TaskKind[]; author?: boolean } = {}) {
  await connectToDatabase();
  const kinds = opts.kinds || ["coding", "assignment"];
  if (opts.author !== false) {
    for (const kind of kinds) {
      const have = await PracticeTask.countDocuments({ kind, role, level, active: true });
      if (have >= 3) continue;
      // Through the bus so the authoring shows up in the agents' conversation; processed right away.
      const type = kind === "coding" ? "coding.author" : "assignment.author";
      const { runId } = await startFlow(type, { role, level, count: 3 - have }, { from: "user", title: `${kind === "coding" ? "Coding questions" : "Home assignments"}: ${role}/${level}`, says: `${kind === "coding" ? "Examiner" : "Assigner"} — we need ${3 - have} more ${kind === "coding" ? "timed question" : "take-home"}${3 - have === 1 ? "" : "s"} for a ${level} ${role}.` });
      await processQueue({ runId, budgetMs: 90_000 });
    }
  }
  const tasks: any[] = await PracticeTask.find({ role, level, active: true, kind: { $in: kinds } }).sort({ difficulty: 1, createdAt: 1 }).lean();
  return tasks;
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
