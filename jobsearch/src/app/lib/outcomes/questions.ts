import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { connectToDatabase } from "@/app/lib/db";
import InterviewQuestion, { QUESTION_STAGES, type QuestionStage } from "@/app/models/InterviewQuestion";
import WebInterviewQuestion from "@/app/models/WebInterviewQuestion";
import ApplicationOutcome from "@/app/models/ApplicationOutcome";
import { extractJson } from "@/app/lib/resume/tailor";
import { companyKey } from "./outcomes";

/**
 * "What did they ask?" — turn the candidate's free-text recollection of a
 * real interview into structured InterviewQuestion rows (one per question,
 * with a topic), de-duplicated per reporter. With OPENAI_API_KEY the split
 * and topics come from gpt-4o-mini; without it (tests, offline) a simple
 * line/question-mark split is used.
 */

const itemSchema = z.object({
  question: z.string().min(3).max(600),
  topic: z.string().max(60).default(""),
  stage: z.enum(QUESTION_STAGES).optional(),
  note: z.string().max(600).default(""),
});
const outSchema = z.object({ questions: z.array(itemSchema).max(40) });

export type CapturedQuestion = z.infer<typeof itemSchema>;

/** Normalised de-dup key: lowercase, no punctuation, collapsed whitespace, first 120 chars. */
export const questionKey = (q: string) =>
  q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

/** Offline fallback: one question per line / sentence ending in "?". */
export function splitQuestionsHeuristic(text: string): CapturedQuestion[] {
  const parts = text
    .split(/\n+|(?<=\?)\s+|(?<=[.;])\s+(?=[A-Zא-ת])/)
    .map((s) => s.replace(/^[\s\-•*\d.)]+/, "").trim())
    .filter((s) => s.length >= 3);
  return parts.slice(0, 40).map((question) => ({ question: question.slice(0, 600), topic: "", note: "" }));
}

export async function structureQuestions(text: string, ctx: { company: string; roleTitle: string; stage: QuestionStage; language?: "he" | "en"; client?: { invoke: (m: any[]) => Promise<{ content: unknown }> } }): Promise<CapturedQuestion[]> {
  const useLLM = !!ctx.client || (!!process.env.OPENAI_API_KEY && process.env.NODE_ENV !== "test");
  if (!useLLM) return splitQuestionsHeuristic(text);
  const client = ctx.client || new ChatOpenAI({ modelName: "gpt-4o-mini", temperature: 0, maxTokens: 1500, openAIApiKey: process.env.OPENAI_API_KEY, modelKwargs: { response_format: { type: "json_object" } } });
  const system = `You turn a candidate's recollection of a real job interview into a clean list of the questions they were asked.
Return JSON: {"questions":[{"question":"...","topic":"short label","stage":"hr|technical|final|other","note":"what the candidate said about it, if anything"}]}.
Rules: one entry per distinct question, in the candidate's language (${ctx.language === "en" ? "English" : "Hebrew unless the text is English"}); keep the question wording close to the original; never invent questions that are not in the text; a topic is 1–3 words (e.g. "React hooks", "system design", "salary expectations", "background"); if the text contains no questions return {"questions":[]}.`;
  const user = `Company: ${ctx.company}\nRole: ${ctx.roleTitle}\nStage: ${ctx.stage}\n\nCandidate's text:\n"""\n${text.slice(0, 6000)}\n"""`;
  try {
    const res = await client.invoke([new SystemMessage(system), new HumanMessage(user)]);
    const content = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
    const parsed = outSchema.safeParse(extractJson(content));
    if (parsed.success) return parsed.data.questions;
  } catch (e) {
    console.warn("[questions] LLM structure failed, using heuristic:", (e as Error)?.message);
  }
  return splitQuestionsHeuristic(text);
}

export type CaptureInput = { userId: string; applicationId?: string; company: string; roleTitle?: string; stage: QuestionStage; text: string; shareable?: boolean; language?: "he" | "en"; client?: any };

/** Store the questions from one interview. Returns the rows written (new ones only). */
export async function captureInterviewQuestions(input: CaptureInput): Promise<{ created: number; questions: CapturedQuestion[] }> {
  await connectToDatabase();
  const items = await structureQuestions(input.text, { company: input.company, roleTitle: input.roleTitle || "", stage: input.stage, language: input.language, client: input.client });
  let created = 0;
  for (const q of items) {
    const key = questionKey(q.question);
    if (!key) continue;
    try {
      await InterviewQuestion.create({
        userId: input.userId,
        applicationId: input.applicationId,
        company: input.company,
        companyKey: companyKey(input.company),
        roleTitle: input.roleTitle || "",
        stage: q.stage && q.stage !== "other" ? q.stage : input.stage,
        question: q.question,
        topic: q.topic || "",
        note: q.note || "",
        key,
        shareable: input.shareable !== false,
        language: input.language || (/[֐-׿]/.test(q.question) ? "he" : "en"),
      });
      created++;
    } catch (e: any) {
      if (e?.code !== 11000) throw e; // duplicate for this reporter → skip
    }
  }
  if (input.applicationId) {
    await ApplicationOutcome.updateOne({ applicationId: input.applicationId, userId: input.userId }, { $addToSet: { questionsCaptured: input.stage } }).catch(() => null);
  }
  return { created, questions: items };
}

/** The candidate doesn't want to (or can't) report this stage. */
export async function skipQuestions(userId: string, applicationId: string, stage: QuestionStage): Promise<void> {
  await connectToDatabase();
  await ApplicationOutcome.updateOne({ applicationId, userId }, { $addToSet: { questionsSkipped: stage } });
}

export type BankSource = { url: string; name: string };
export type BankQuestion = {
  question: string;
  topic: string;
  stage: QuestionStage;
  /** How many of OUR candidates reported it (0 = only seen on the web). */
  count: number;
  /** How many public web sources report it. */
  web: number;
  sources: BankSource[];
  roleTitles: string[];
  lastAskedAt: Date;
};

export type Bank = { company: string; total: number; reported: number; reporters: number; webCount: number; questions: BankQuestion[] };

/**
 * The question bank for a company: what our candidates reported (shareable
 * rows, grouped by key, with how many reported each) merged with questions
 * harvested from public sources (WebInterviewQuestion), each labelled by
 * provenance. `userId` also returns that user's private (non-shareable) reports.
 */
export async function questionBank(company: string, opts: { stage?: QuestionStage; limit?: number; userId?: string } = {}): Promise<Bank> {
  await connectToDatabase();
  const key = companyKey(company);
  const filter: Record<string, unknown> = { companyKey: key, ...(opts.stage ? { stage: opts.stage } : {}) };
  filter.$or = opts.userId ? [{ shareable: true }, { userId: opts.userId }] : [{ shareable: true }];
  const [rows, webRows]: [any[], any[]] = await Promise.all([
    InterviewQuestion.find(filter).sort({ askedAt: -1 }).limit(2000).lean(),
    WebInterviewQuestion.find({ companyKey: key, ...(opts.stage ? { stage: opts.stage } : {}) }).sort({ harvestedAt: -1 }).limit(500).lean(),
  ]);
  const byKey = new Map<string, BankQuestion & { reporters: Set<string> }>();
  const reporters = new Set<string>();
  for (const r of rows) {
    reporters.add(String(r.userId));
    const k = `${r.stage}:${r.key}`;
    const cur = byKey.get(k);
    if (cur) {
      cur.count++;
      cur.reporters.add(String(r.userId));
      if (r.roleTitle && !cur.roleTitles.includes(r.roleTitle)) cur.roleTitles.push(r.roleTitle);
      if (!cur.topic && r.topic) cur.topic = r.topic;
    } else byKey.set(k, { question: r.question, topic: r.topic || "", stage: r.stage, count: 1, web: 0, sources: [], roleTitles: r.roleTitle ? [r.roleTitle] : [], lastAskedAt: r.askedAt, reporters: new Set([String(r.userId)]) });
  }
  let webCount = 0;
  for (const w of webRows) {
    const k = `${w.stage}:${w.key}`;
    const src: BankSource[] = w.sourceUrl || w.sourceName ? [{ url: w.sourceUrl || "", name: w.sourceName || "" }] : [];
    const cur = byKey.get(k);
    if (cur) {
      cur.web++;
      cur.sources.push(...src);
      if (!cur.topic && w.topic) cur.topic = w.topic;
    } else {
      webCount++;
      byKey.set(k, { question: w.question, topic: w.topic || "", stage: w.stage, count: 0, web: 1, sources: src, roleTitles: w.roleTitle ? [w.roleTitle] : [], lastAskedAt: w.harvestedAt, reporters: new Set() });
    }
  }
  // Our candidates' reports first (that is the brand), then the web; within each, the most-corroborated.
  const questions = [...byKey.values()]
    .sort((a, b) => Number(b.count > 0) - Number(a.count > 0) || b.reporters.size - a.reporters.size || b.count - a.count || b.web - a.web || new Date(b.lastAskedAt).getTime() - new Date(a.lastAskedAt).getTime())
    .slice(0, opts.limit ?? 200)
    .map(({ reporters: _r, ...q }) => q);
  // Display name: the spelling most reporters used (e.g. "Wix" over "WIX" / "Wix.com Ltd"); the web rows' name when nobody reported yet.
  const spellings = new Map<string, number>();
  for (const r of rows) spellings.set(r.company, (spellings.get(r.company) || 0) + 1);
  const display = [...spellings.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || webRows[0]?.company || company;
  return { company: display, total: byKey.size, reported: byKey.size - webCount, reporters: reporters.size, webCount, questions };
}

export type BankCompany = { company: string; companyKey: string; questions: number; reported: number; web: number; reporters: number; lastAskedAt: Date };

/** Companies with questions (ours or harvested), most-reported first (for the bank index + sitemap). */
export async function companiesWithQuestions(limit = 500): Promise<BankCompany[]> {
  await connectToDatabase();
  const [ours, web]: [any[], any[]] = await Promise.all([
    InterviewQuestion.aggregate([
      { $match: { shareable: true } },
      { $group: { _id: "$companyKey", company: { $first: "$company" }, keys: { $addToSet: { $concat: ["$stage", ":", "$key"] } }, reporters: { $addToSet: "$userId" }, lastAskedAt: { $max: "$askedAt" } } },
    ]),
    WebInterviewQuestion.aggregate([{ $group: { _id: "$companyKey", company: { $first: "$company" }, keys: { $addToSet: { $concat: ["$stage", ":", "$key"] } }, lastAskedAt: { $max: "$harvestedAt" } } }]),
  ]);
  const out = new Map<string, BankCompany & { keys: Set<string> }>();
  for (const r of ours) out.set(r._id, { company: r.company, companyKey: r._id, questions: 0, reported: r.keys.length, web: 0, reporters: r.reporters.length, lastAskedAt: r.lastAskedAt, keys: new Set(r.keys) });
  for (const w of web) {
    const cur = out.get(w._id);
    if (cur) {
      const before = cur.keys.size;
      for (const k of w.keys) cur.keys.add(k);
      cur.web = cur.keys.size - before;
      if (new Date(w.lastAskedAt) > new Date(cur.lastAskedAt)) cur.lastAskedAt = w.lastAskedAt;
    } else out.set(w._id, { company: w.company, companyKey: w._id, questions: 0, reported: 0, web: w.keys.length, reporters: 0, lastAskedAt: w.lastAskedAt, keys: new Set(w.keys) });
  }
  return [...out.values()]
    .map(({ keys, ...c }) => ({ ...c, questions: keys.size }))
    .sort((a, b) => b.reported - a.reported || b.questions - a.questions || new Date(b.lastAskedAt).getTime() - new Date(a.lastAskedAt).getTime())
    .slice(0, limit);
}

/** Compact text of real questions for prompts (interviewer brief, prep plan), provenance included. */
export async function reportedQuestionsText(company: string, opts: { stage?: QuestionStage; limit?: number } = {}): Promise<string> {
  const bank = await questionBank(company, { stage: opts.stage, limit: opts.limit ?? 15 });
  if (!bank.questions.length) return "";
  return bank.questions
    .map((q) => {
      const prov = q.count > 0 ? (q.count > 1 ? ` (reported by ${q.count} of our candidates)` : "") : ` (seen on ${q.sources[0]?.name || "the web"})`;
      return `- [${q.stage}${q.topic ? ` · ${q.topic}` : ""}] ${q.question}${prov}`;
    })
    .join("\n");
}
