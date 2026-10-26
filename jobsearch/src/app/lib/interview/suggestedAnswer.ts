import crypto from "node:crypto";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import SuggestedAnswer from "@/app/models/SuggestedAnswer";
import { gatherCompanyContext } from "@/app/lib/interview/companyContext";

export const ANSWER_MODEL = process.env.PRACTICE_MODEL || "gpt-4o-mini";

export const answerKey = (company: string, question: string) =>
  crypto.createHash("sha256").update(`${company.trim().toLowerCase()}|${question.trim()}`).digest("hex");

const outSchema = z.object({
  answer: z.string().min(1),
  tips: z.array(z.string()).max(3).default([]),
});

export type SuggestedAnswerResult =
  | { ok: true; answer: string; tips: string[]; placeholders: number; cached: boolean }
  | { ok: false; reason: "NO_RESUME" | "NO_LLM" };

const hasHebrew = (s: string) => /[֐-׿]/.test(s);

/**
 * The answer is a draft in the candidate's own voice, built ONLY from résumé
 * facts. Where the résumé is silent, the model leaves a bracketed placeholder
 * ("[הוסף/י: …]") instead of inventing an employer, a number or a story — the
 * person fills those in. Cached per (user, question, résumé version).
 */
export async function suggestAnswer(opts: { userId: string; company: string; question: string; stage?: string; topic?: string; onCacheMiss?: () => Promise<void> }): Promise<SuggestedAnswerResult> {
  await connectToDatabase();
  const user: any = await User.findById(opts.userId).select("+resumeText resumeUpdatedAt fullname currentJob").lean();
  const resumeText = String(user?.resumeText || "").trim();
  if (!resumeText) return { ok: false, reason: "NO_RESUME" };
  const resumeVersion = String(user?.resumeUpdatedAt ? new Date(user.resumeUpdatedAt).getTime() : 0);
  const key = answerKey(opts.company, opts.question);

  const cached: any = await SuggestedAnswer.findOne({ userId: opts.userId, key, resumeVersion }).lean();
  if (cached) return { ok: true, answer: cached.answer, tips: cached.tips || [], placeholders: cached.placeholders || 0, cached: true };

  if (!process.env.OPENAI_API_KEY) return { ok: false, reason: "NO_LLM" };
  if (opts.onCacheMiss) await opts.onCacheMiss(); // the quota is charged only when we really call the model

  const ctx = await gatherCompanyContext(opts.company).catch(() => null);
  const brief = ctx
    ? [ctx.websiteExcerpt && `About: ${ctx.websiteExcerpt.slice(0, 600)}`, ctx.techSignals?.length && `Tech they mention: ${ctx.techSignals.slice(0, 12).map((t) => t.term).join(", ")}`, ctx.sampleTitles?.length && `Open roles: ${ctx.sampleTitles.slice(0, 6).join(" | ")}`]
        .filter(Boolean)
        .join("\n")
    : "";
  const lang = hasHebrew(opts.question) || !/[A-Za-z]{3,}/.test(opts.question) ? "Hebrew (natural spoken register; technical terms in English)" : "English";

  const system = `You are an interview coach drafting a MODEL ANSWER the candidate can say out loud, in first person, in ${lang}.
Rules that matter more than fluency:
- Use ONLY facts that appear in the résumé below: employers, projects, technologies, numbers, durations. Never invent an employer, a metric, a teammate, or a story.
- Where the question needs something the résumé does not contain, write a short bracketed placeholder for the candidate to fill, e.g. "[הוסף/י: מספר המשתמשים]" or "[add: what the outcome was]". Prefer one or two placeholders over a vague answer.
- Behavioural questions follow Situation → Task → Action → Result, in prose, 90–150 words. Technical questions: a direct answer first, then one concrete example from the résumé, 80–140 words.
- Match the company: reference its products/stack from the brief only when it is genuinely relevant.
- No preamble, no headings, no bullet lists inside the answer. Then give up to 2 one-line tips (what the interviewer at this company is probably listening for).
Return JSON: {"answer": string, "tips": string[]}.`;
  const userMsg = `COMPANY: ${opts.company}${opts.stage ? `\nSTAGE: ${opts.stage}` : ""}${opts.topic ? `\nTOPIC: ${opts.topic}` : ""}
COMPANY BRIEF:
"""${brief || "(none)"}"""
QUESTION: ${opts.question}
CANDIDATE RÉSUMÉ:
"""${resumeText.slice(0, 6000)}"""`;

  const res = await new ChatOpenAI({ modelName: ANSWER_MODEL, temperature: 0.4, maxTokens: 700, timeout: 45_000, maxRetries: 1, openAIApiKey: process.env.OPENAI_API_KEY, modelKwargs: { response_format: { type: "json_object" } } }).invoke([new SystemMessage(system), new HumanMessage(userMsg)]);
  const raw = typeof res.content === "string" ? res.content : (res.content as any[]).map((p) => p?.text ?? "").join("");
  const parsed = outSchema.parse(JSON.parse(raw));
  const placeholders = (parsed.answer.match(/\[[^\]]{2,}\]/g) || []).length;

  await SuggestedAnswer.updateOne(
    { userId: opts.userId, key, resumeVersion },
    { $setOnInsert: { userId: opts.userId, key, resumeVersion, company: opts.company, question: opts.question.slice(0, 500), answer: parsed.answer, tips: parsed.tips, placeholders } },
    { upsert: true }
  ).catch(() => {}); // a concurrent request may have written it first; either copy is fine
  return { ok: true, answer: parsed.answer, tips: parsed.tips, placeholders, cached: false };
}
