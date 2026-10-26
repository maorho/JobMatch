import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { connectToDatabase } from "@/app/lib/db";
import PracticeAttempt from "@/app/models/PracticeAttempt";
import PracticeTask from "@/app/models/PracticeTask";
import { extractJson } from "@/app/lib/resume/tailor";
import { ROLE_INFO, LEVEL_HE } from "./roles";

/**
 * Grading for the practice agents: the Examiner grades code against the
 * question's rubric, the Assigner reviews a take-home write-up / repo
 * description. gpt-4o-mini with a strict JSON verdict; without a key a
 * transparent heuristic so the flow still completes (tests, offline).
 */
export const GRADE_MODEL = process.env.PRACTICE_MODEL || "gpt-4o-mini";
export const LATE_GRACE_SEC = 60;

type LLM = { invoke: (m: any[]) => Promise<{ content: unknown }> };
const str = z.preprocess((v) => (v == null ? "" : typeof v === "string" ? v : String(v)), z.string());
const pct = z.preprocess((v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0))), z.number());
const verdictSchema = z.object({
  breakdown: z.preprocess((v) => (Array.isArray(v) ? v.slice(0, 8) : []), z.array(z.object({ criterion: str.pipe(z.string().max(80)), score: pct, comment: str.pipe(z.string().max(500)).default("") }))).default([]),
  feedback: str.pipe(z.string().max(6000)).default(""),
  strengths: z.preprocess((v) => (Array.isArray(v) ? v.filter((s) => typeof s === "string").slice(0, 5) : []), z.array(z.string())).default([]),
  improvements: z.preprocess((v) => (Array.isArray(v) ? v.filter((s) => typeof s === "string").slice(0, 5) : []), z.array(z.string())).default([]),
  verdict: z.preprocess((v) => (["pass", "borderline", "fail"].includes(String(v)) ? String(v) : "borderline"), z.enum(["pass", "borderline", "fail"])),
});
export type Verdict = z.infer<typeof verdictSchema> & { score: number };

/** Weighted score from the per-criterion scores (weights from the task's rubric). */
export function weightedScore(breakdown: { criterion: string; score: number }[], rubric: { criterion: string; weight: number }[]): number {
  if (!breakdown.length) return 0;
  const weightOf = new Map(rubric.map((r) => [r.criterion, r.weight || 1]));
  let sum = 0;
  let wsum = 0;
  for (const b of breakdown) {
    const w = weightOf.get(b.criterion) ?? 1;
    sum += b.score * w;
    wsum += w;
  }
  return wsum ? Math.round(sum / wsum) : 0;
}

export function buildGradePrompt(task: any, attempt: any): { system: string; user: string } {
  const info = ROLE_INFO[task.role as keyof typeof ROLE_INFO];
  const rubric = (task.rubric || []).map((r: any) => `- ${r.criterion} (weight ${r.weight})${r.description ? `: ${r.description}` : ""}`).join("\n");
  const system =
    task.kind === "coding"
      ? `You are the Examiner at an Israeli tech company grading a timed coding question for a ${LEVEL_HE[task.level as keyof typeof LEVEL_HE]} ${info.en} candidate. Be rigorous and fair: judge correctness by reasoning through the examples and edge cases, state complexity, and point at concrete lines. Do not reward length. If the code does not solve the problem, correctness is below 30 regardless of style.
Write "feedback", "comment", "strengths" and "improvements" in HEBREW (code and identifiers in English). Keep feedback under 200 words.`
      : `You are the Assigner (a hiring manager) at an Israeli tech company reviewing a take-home assignment handed in by a ${LEVEL_HE[task.level as keyof typeof LEVEL_HE]} ${info.en} candidate. You see their write-up and, if given, a repository URL (you cannot open it: judge what they describe, and say what you would verify in the repo). Check every deliverable, the design decisions and how they explain them. Be concrete and kind but honest.
Write "feedback", "comment", "strengths" and "improvements" in HEBREW (technical terms in English). Keep feedback under 250 words.`;
  const user = `TASK: ${task.title}
${task.prompt}
${task.examples?.length ? `\nExamples:\n${task.examples.map((e: any) => `- in: ${e.input} → out: ${e.output}`).join("\n")}` : ""}${task.constraints?.length ? `\nConstraints: ${task.constraints.join("; ")}` : ""}${task.deliverables?.length ? `\nDeliverables:\n${task.deliverables.map((d: string) => `- ${d}`).join("\n")}` : ""}

RUBRIC (score each criterion 0–100):
${rubric}

SUBMISSION${attempt.timedOut ? " (handed in AFTER the time limit — note it, do not fail it for that alone)" : ""}${attempt.durationSec ? ` — took ${Math.round(attempt.durationSec / 60)} min of ${task.timeLimitMin || task.estimatedHours * 60}` : ""}:
${attempt.repoUrl ? `Repository: ${attempt.repoUrl}\n` : ""}"""
${String(attempt.answer || "").slice(0, 20000)}
"""

Return STRICT JSON: {"breakdown":[{"criterion":"<exactly as in the rubric>","score":0-100,"comment":"..."}],"feedback":"...","strengths":["..."],"improvements":["..."],"verdict":"pass|borderline|fail"}
Every rubric criterion appears exactly once in "breakdown".`;
  return { system, user };
}

/** Offline grader: transparent rules so the loop works without a model. */
export function heuristicVerdict(task: any, attempt: any): Verdict {
  const text = String(attempt.answer || "");
  const hasCode = /\b(function|def |class |=>|return|SELECT|select |#!\/)/.test(text);
  const len = text.trim().length;
  const base = task.kind === "coding" ? (len < 20 ? 0 : hasCode ? 55 : 30) : len < 80 && !attempt.repoUrl ? 10 : attempt.repoUrl ? 60 : 45;
  const bonus = task.kind === "coding" ? (/\/\/|#|\/\*/.test(text) ? 5 : 0) + (/O\(/.test(text) ? 5 : 0) + (/test|expect|assert/i.test(text) ? 5 : 0) : Math.min(15, (task.deliverables || []).filter((d: string) => text.toLowerCase().includes(String(d).split(" ")[0].toLowerCase())).length * 5) + (/test|בדיק/i.test(text) ? 5 : 0);
  const penalty = attempt.timedOut ? 15 : 0;
  const s = Math.max(0, Math.min(100, base + bonus - penalty));
  const breakdown = (task.rubric || []).map((r: any) => ({ criterion: r.criterion, score: s, comment: "" }));
  const score = weightedScore(breakdown, task.rubric || []) || s;
  return {
    score,
    breakdown,
    feedback: len === 0 ? "לא הוגש תוכן." : `הערכה אוטומטית בסיסית (ללא מודל): ${hasCode || attempt.repoUrl ? "ההגשה מכילה תוכן רלוונטי" : "ההגשה קצרה או לא מכילה קוד"}${attempt.timedOut ? ", והוגשה אחרי הזמן" : ""}.`,
    strengths: hasCode ? ["יש פתרון מוצע"] : [],
    improvements: attempt.timedOut ? ["ניהול זמן: תכננו 5 דקות לקריאה ו-5 לבדיקה עצמית"] : [],
    verdict: score >= 70 ? "pass" : score >= 45 ? "borderline" : "fail",
  };
}

export async function gradeWithModel(task: any, attempt: any, client?: LLM): Promise<Verdict | null> {
  const useLLM = !!client || (!!process.env.OPENAI_API_KEY && process.env.NODE_ENV !== "test");
  if (!useLLM) return null;
  const llm = client || new ChatOpenAI({ modelName: GRADE_MODEL, temperature: 0, maxTokens: 2500, openAIApiKey: process.env.OPENAI_API_KEY, modelKwargs: { response_format: { type: "json_object" } } });
  const { system, user } = buildGradePrompt(task, attempt);
  const res = await llm.invoke([new SystemMessage(system), new HumanMessage(user)]);
  const content = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
  const parsed = verdictSchema.safeParse(extractJson(content));
  if (!parsed.success) return null;
  // Missing criteria get the mean of the rest so one dropped line never zeroes a submission.
  const have = new Set(parsed.data.breakdown.map((b) => b.criterion));
  const mean = parsed.data.breakdown.length ? Math.round(parsed.data.breakdown.reduce((s, b) => s + b.score, 0) / parsed.data.breakdown.length) : 0;
  for (const r of task.rubric || []) if (!have.has(r.criterion)) parsed.data.breakdown.push({ criterion: r.criterion, score: mean, comment: "" });
  const score = weightedScore(parsed.data.breakdown, task.rubric || []);
  return { ...parsed.data, score };
}

/** Grade one submitted attempt and store the verdict. Idempotent: an already-graded attempt is returned as is. */
export async function gradeAttempt(attemptId: string, opts: { client?: LLM; by: "examiner" | "assigner" }): Promise<{ attempt: any; task: any; verdict: Verdict; model: string } | null> {
  await connectToDatabase();
  const attempt: any = await PracticeAttempt.findById(attemptId);
  if (!attempt) return null;
  const task: any = await PracticeTask.findById(attempt.taskId).lean();
  if (!task) return null;
  if (attempt.status === "graded") return { attempt: attempt.toObject(), task, verdict: { score: attempt.score, breakdown: attempt.breakdown, feedback: attempt.feedback, strengths: attempt.strengths, improvements: attempt.improvements, verdict: attempt.verdict || "borderline" }, model: attempt.model };
  let verdict: Verdict | null = null;
  let model = "";
  try {
    verdict = await gradeWithModel(task, attempt, opts.client);
    if (verdict) model = GRADE_MODEL;
  } catch (e) {
    attempt.error = `model: ${(e as Error)?.message}`.slice(0, 500);
  }
  if (!verdict) {
    verdict = heuristicVerdict(task, attempt);
    model = "heuristic";
  }
  attempt.score = verdict.score;
  attempt.verdict = verdict.verdict;
  attempt.breakdown = verdict.breakdown.map((b) => ({ ...b, weight: (task.rubric || []).find((r: any) => r.criterion === b.criterion)?.weight ?? 1 }));
  attempt.feedback = verdict.feedback;
  attempt.strengths = verdict.strengths;
  attempt.improvements = verdict.improvements;
  attempt.gradedBy = opts.by;
  attempt.gradedAt = new Date();
  attempt.model = model;
  attempt.status = "graded";
  await attempt.save();
  await PracticeTask.updateOne({ _id: task._id }, { $inc: { "stats.graded": 1, "stats.scoreSum": verdict.score } });
  return { attempt: attempt.toObject(), task, verdict, model };
}
