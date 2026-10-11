import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { connectToDatabase } from "@/app/lib/db";
import PracticeTask from "@/app/models/PracticeTask";
import { extractJson } from "@/app/lib/resume/tailor";
import { ROLE_INFO, LEVEL_HE, codingMinutes, assignmentHours, type PracticeRole, type PracticeLevel, type TaskKind } from "./roles";
import { SEEDS } from "./seeds";

/**
 * Task authoring for the two practice agents. The Examiner writes timed
 * coding questions, the Assigner writes take-home assignments; both go
 * through `authorTasks`, which asks gpt-4o-mini for fresh tasks (JSON,
 * validated) and falls back to the built-in seeds when there is no key.
 */
export const AUTHOR_MODEL = process.env.PRACTICE_MODEL || "gpt-4o-mini";
export const MIN_TASKS = 3;

type LLM = { invoke: (m: any[]) => Promise<{ content: unknown }> };
const str = z.preprocess((v) => (v == null ? "" : typeof v === "string" ? v : String(v)), z.string());
const strList = (max: number) => z.preprocess((v) => (Array.isArray(v) ? v.filter((s) => typeof s === "string" && s.trim()).slice(0, max) : []), z.array(z.string())).default([]);

const taskSchema = z.object({
  title: str.pipe(z.string().min(3).max(120)),
  prompt: str.pipe(z.string().min(40).max(6000)),
  language: str.pipe(z.string().max(20)).default(""),
  starterCode: str.pipe(z.string().max(3000)).default(""),
  examples: z.preprocess((v) => (Array.isArray(v) ? v.slice(0, 4) : []), z.array(z.object({ input: str.default(""), output: str.default(""), explanation: str.default("") }))).default([]),
  constraints: strList(6),
  deliverables: strList(8),
  rubric: z.preprocess((v) => (Array.isArray(v) ? v.slice(0, 6) : []), z.array(z.object({ criterion: str.pipe(z.string().min(2).max(80)), weight: z.preprocess((w) => Number(w) || 1, z.number().min(0.5).max(10)), description: str.pipe(z.string().max(300)).default("") }))).default([]),
  hints: strList(3),
  tags: strList(6),
  difficulty: z.preprocess((v) => Math.min(5, Math.max(1, Math.round(Number(v) || 2))), z.number()),
});
const outSchema = z.object({ tasks: z.preprocess((v) => (Array.isArray(v) ? v.map((t) => taskSchema.safeParse(t)).filter((r) => r.success).map((r) => (r as any).data) : []), z.array(taskSchema)) });
export type AuthoredTask = z.infer<typeof taskSchema>;

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "task";

export function buildAuthorPrompt(kind: TaskKind, role: PracticeRole, level: PracticeLevel, count: number, avoidTitles: string[]): { system: string; user: string } {
  const info = ROLE_INFO[role];
  const minutes = codingMinutes(role, level);
  const hours = assignmentHours(role, level);
  const system =
    kind === "coding"
      ? `You are the Examiner at an Israeli tech company: you write timed coding questions for ${info.en} candidates at ${level} level (stack: ${info.stack}).
Each question must be solvable in about ${minutes} minutes by a good ${level} candidate, self-contained, realistic for the role (not a random LeetCode puzzle — something this role actually does), and have a crisp statement with 1–3 examples and constraints that make the complexity matter.
Write the statement, examples, hints and rubric in HEBREW; keep identifiers, code, API names and technical terms in English. Starter code in ${info.language} (a function/class signature only).
The rubric has 3–5 weighted criteria (e.g. correctness 4, complexity 2, readability 2, edge cases 2) with one-line descriptions.`
      : `You are the Assigner at an Israeli tech company: you design take-home assignments for ${info.en} candidates at ${level} level (stack: ${info.stack}).
Each assignment should take about ${hours} hours, mirror real work for the role, have 4–6 concrete deliverables (what to hand in), and leave room for judgement (a design decision the candidate must make and explain).
Write the brief and deliverables in HEBREW; keep technical terms, tool names and code in English.
The rubric has 4–6 weighted criteria (e.g. requirements 3, architecture 2, code quality 2, tests 2, README 1) with one-line descriptions.`;
  const user = `Write ${count} distinct ${kind === "coding" ? "coding question" : "take-home assignment"}${count === 1 ? "" : "s"} for a ${LEVEL_HE[level]} ${info.he} candidate.${avoidTitles.length ? `\nAvoid these topics (already in the bank): ${avoidTitles.slice(0, 20).join(" | ")}` : ""}
Return STRICT JSON: {"tasks":[{"title","prompt","language","starterCode","examples":[{"input","output","explanation"}],"constraints":[],"deliverables":[],"rubric":[{"criterion","weight","description"}],"hints":[],"tags":[],"difficulty":1-5}]}
Paragraphs in "prompt" are separated by blank lines. No markdown headings.`;
  return { system, user };
}

export async function authorTasks(kind: TaskKind, role: PracticeRole, level: PracticeLevel, count: number, opts: { avoidTitles?: string[]; client?: LLM } = {}): Promise<AuthoredTask[]> {
  const useLLM = !!opts.client || (!!process.env.OPENAI_API_KEY && process.env.NODE_ENV !== "test");
  if (!useLLM) return [];
  // Three full questions with starter code run past 12k characters; the budget must cover that or the JSON is cut mid-array.
  const client = opts.client || new ChatOpenAI({ modelName: AUTHOR_MODEL, temperature: 0.7, maxTokens: 10_000, openAIApiKey: process.env.OPENAI_API_KEY, modelKwargs: { response_format: { type: "json_object" } } });
  const ask = async (n: number) => {
    const { system, user } = buildAuthorPrompt(kind, role, level, n, opts.avoidTitles || []);
    const res = await client.invoke([new SystemMessage(system), new HumanMessage(user)]);
    const content = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
    const parsed = outSchema.safeParse(extractJson(content));
    return parsed.success ? parsed.data.tasks.slice(0, n) : [];
  };
  try {
    const tasks = await ask(count);
    if (tasks.length || count === 1) return tasks;
  } catch (e) {
    if (count === 1) throw e;
  }
  return ask(1); // a shorter answer is far less likely to be malformed
}

/** Insert an authored (or seed) task; returns null when its key already exists. */
export async function saveTask(kind: TaskKind, role: PracticeRole, level: PracticeLevel, t: AuthoredTask & { slug?: string }, source: "llm" | "seed") {
  const key = `${kind}:${role}:${level}:${t.slug || slugify(t.title)}`;
  const doc = {
    kind,
    role,
    level,
    key,
    title: t.title,
    prompt: t.prompt,
    language: t.language || (kind === "coding" ? ROLE_INFO[role].language : ""),
    starterCode: t.starterCode || "",
    examples: t.examples || [],
    constraints: t.constraints || [],
    deliverables: t.deliverables || [],
    rubric: t.rubric?.length ? t.rubric : kind === "coding" ? [{ criterion: "נכונות", weight: 4 }, { criterion: "סיבוכיות", weight: 2 }, { criterion: "קריאות", weight: 2 }, { criterion: "מקרי קצה", weight: 2 }] : [{ criterion: "עמידה בדרישות", weight: 3 }, { criterion: "ארכיטקטורה", weight: 2 }, { criterion: "איכות קוד", weight: 2 }, { criterion: "בדיקות", weight: 2 }, { criterion: "README", weight: 1 }],
    hints: t.hints || [],
    tags: t.tags || [],
    timeLimitMin: kind === "coding" ? codingMinutes(role, level) : 0,
    estimatedHours: kind === "assignment" ? assignmentHours(role, level) : 0,
    difficulty: t.difficulty || 2,
    source,
    createdBy: kind === "coding" ? "examiner" : "assigner",
  };
  try {
    return await PracticeTask.create(doc);
  } catch (e: any) {
    if (e?.code === 11000) return null;
    throw e;
  }
}

/**
 * Make sure at least `min` active tasks exist for kind × role × level.
 * With an LLM: author the missing ones (avoiding titles already there).
 * Without: insert the built-in seeds for the role. Returns how many were added.
 */
export async function ensureTasks(kind: TaskKind, role: PracticeRole, level: PracticeLevel, opts: { min?: number; add?: number; client?: LLM; log?: (l: string) => void } = {}): Promise<{ before: number; added: number; source: "llm" | "seed" | "none" }> {
  await connectToDatabase();
  const existing: any[] = await PracticeTask.find({ kind, role, level, active: true }).select("title").lean();
  // `add` = this many more on top of what exists (what the agents are asked for); `min` = a floor.
  const min = opts.add != null ? existing.length + opts.add : opts.min ?? MIN_TASKS;
  if (existing.length >= min) return { before: existing.length, added: 0, source: "none" };
  const need = min - existing.length;
  let added = 0;
  const authored = await authorTasks(kind, role, level, need, { avoidTitles: existing.map((t) => t.title), client: opts.client }).catch((e) => {
    opts.log?.(`authoring failed: ${(e as Error)?.message}`);
    return [] as AuthoredTask[];
  });
  for (const t of authored) if (await saveTask(kind, role, level, t, "llm")) added++;
  if (added > 0) return { before: existing.length, added, source: "llm" };
  // Seeds: the role's built-ins of this kind, scaled to the level by the clock.
  for (const s of SEEDS[role].filter((s) => s.kind === kind)) {
    if (added >= need) break;
    if (await saveTask(kind, role, level, { ...s, language: s.language || "", starterCode: s.starterCode || "", examples: (s.examples || []).map((e) => ({ input: e.input, output: e.output, explanation: e.explanation || "" })), constraints: s.constraints || [], deliverables: s.deliverables || [], rubric: s.rubric.map((r) => ({ ...r, description: r.description || "" })), hints: s.hints || [], tags: s.tags, difficulty: s.difficulty }, "seed")) added++;
  }
  return { before: existing.length, added, source: added ? "seed" : "none" };
}
