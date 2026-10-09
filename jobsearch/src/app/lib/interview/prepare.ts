import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import { extractJson } from "@/app/lib/resume/tailor";
import { seniorityOf } from "@/app/lib/jobTaxonomy";
import type { CompanyContext } from "./companyContext";

/**
 * Interview-prep agent: turns everything we know (posting, company context,
 * the candidate's résumé) into a stage-by-stage plan, and powers a practice
 * chat per stage.
 */
export const STAGE_KEYS = ["hr", "technical", "home_assignment", "system_design", "behavioral", "final"] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

const questionSchema = z.object({
  question: z.string(),
  whyAsked: z.string().default(""),
  howToAnswer: z.string().default(""),
  sampleAnswer: z.string().optional(),
});
const stageSchema = z.object({
  key: z.enum(STAGE_KEYS),
  title: z.string(),
  description: z.string().default(""),
  durationHint: z.string().optional(),
  likelyQuestions: z.array(questionSchema).default([]),
  tips: z.array(z.string()).default([]),
});
export const planSchema = z.object({
  company: z.object({
    summary: z.string().default(""),
    whatTheyDo: z.string().default(""),
    techStack: z.array(z.string()).default([]),
    cultureHints: z.array(z.string()).default([]),
  }),
  roleSummary: z.string().default(""),
  stages: z.array(stageSchema).min(2),
  gaps: z.array(z.object({ topic: z.string(), whyItMatters: z.string().default(""), studyPlan: z.string().default("") })).default([]),
  questionsToAsk: z.array(z.string()).default([]),
  checklist: z.array(z.string()).default([]),
});
export type InterviewPlan = z.infer<typeof planSchema>;

export type PrepInput = {
  job: { title: string; company: string; description: string; seniority?: string[] };
  companyContext: CompanyContext;
  resumeText?: string;
  language?: "he" | "en";
};

const MAX = 6000;
export const PREP_MODEL = "gpt-4o";

export function buildPrepPrompt(input: PrepInput): { system: string; user: string } {
  const lang = input.language === "en" ? "English" : "Hebrew";
  const level = seniorityOf(input.job.title, input.job.seniority);
  const system = `
You are an expert interview coach for software/tech roles in Israel. Build a concrete, stage-by-stage interview preparation plan for ONE candidate and ONE job.

RULES
- Write all explanatory text in ${lang}; keep technical terms, tool names and code in English.
- Ground everything in the provided posting, company context and résumé. Do not invent facts about the company; when unsure, say what to verify.
- Tailor to the level: ${level}. For junior roles emphasise fundamentals, a possible home assignment / online test, and how to present projects.
- Stages: choose 4-6 from ${STAGE_KEYS.join(", ")} in the order this company most likely runs them. Each stage: 4-8 likely questions, each with whyAsked + howToAnswer (a sampleAnswer for the 2-3 most important, based on the candidate's résumé when possible), and 3-5 tips.
- gaps: skills/topics the posting wants that the résumé doesn't show, each with a short study plan (what to learn, how, how long).
- questionsToAsk: 5-8 smart questions for the candidate to ask. checklist: logistics and must-dos before the interview.

OUTPUT strict JSON only:
{"company":{"summary":"","whatTheyDo":"","techStack":[],"cultureHints":[]},"roleSummary":"","stages":[{"key":"hr","title":"","description":"","durationHint":"","likelyQuestions":[{"question":"","whyAsked":"","howToAnswer":"","sampleAnswer":""}],"tips":[]}],"gaps":[{"topic":"","whyItMatters":"","studyPlan":""}],"questionsToAsk":[],"checklist":[]}`.trim();

  const cc = input.companyContext;
  const user = `JOB — ${input.job.title} at ${input.job.company}
"""
${(input.job.description || "").slice(0, MAX)}
"""

COMPANY CONTEXT (from our catalog and the company website)
- Open roles in our catalog: ${cc.openRoles}; sample titles: ${cc.sampleTitles.join(" | ") || "-"}
- Tech signals across their postings: ${cc.techSignals.map((t) => `${t.term}(${t.count})`).join(", ") || "-"}
- Website: ${cc.domain || "-"}
- Website excerpt: ${cc.websiteExcerpt ? cc.websiteExcerpt.slice(0, 2500) : "(not available)"}

CANDIDATE RÉSUMÉ
"""
${(input.resumeText || "(no résumé on file — keep sample answers generic and say what to prepare)").slice(0, MAX)}
"""

Return the JSON plan.`;
  return { system, user };
}

function llm(temperature: number) {
  return new ChatOpenAI({ modelName: PREP_MODEL, maxTokens: 8000, timeout: 90_000, temperature, openAIApiKey: process.env.OPENAI_API_KEY, modelKwargs: { response_format: { type: "json_object" } } });
}
const contentOf = (res: any): string => (typeof res.content === "string" ? res.content : (res.content as any[]).map((p) => p?.text ?? "").join(""));

export async function generateInterviewPlan(input: PrepInput): Promise<InterviewPlan> {
  const { system, user } = buildPrepPrompt(input);
  const res = await llm(0.3).invoke([new SystemMessage(system), new HumanMessage(user)]);
  const parsed = planSchema.safeParse(extractJson(contentOf(res)));
  if (!parsed.success) throw new Error(`Plan output invalid: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).slice(0, 5).join("; ")}`);
  return parsed.data;
}

/** Practice mode: the coach asks one question at a time and gives feedback. */
export type PracticeTurn = { role: "user" | "assistant"; content: string };

export async function practiceReply(opts: {
  plan: InterviewPlan;
  stage: StageKey;
  job: { title: string; company: string };
  resumeText?: string;
  transcript: PracticeTurn[];
  language?: "he" | "en";
}): Promise<string> {
  const stage = opts.plan.stages.find((s) => s.key === opts.stage) || opts.plan.stages[0];
  const lang = opts.language === "en" ? "English" : "Hebrew";
  const system = `
You are running a mock "${stage.title}" interview for the role ${opts.job.title} at ${opts.job.company}. Speak ${lang}; technical terms in English.
Behave like a real interviewer at this stage: ask ONE question at a time (draw from these likely questions but adapt: ${stage.likelyQuestions.map((q) => q.question).slice(0, 8).join(" | ")}).
After each candidate answer: give brief, honest feedback (what was good, what to improve, a stronger version in 2-3 lines), then ask the next question. Keep each reply under 180 words.
Candidate résumé (for personalised follow-ups): """${(opts.resumeText || "").slice(0, 3000)}"""
If the transcript is empty, open with a one-line intro and the first question.`.trim();
  const msgs = [new SystemMessage(system), ...opts.transcript.slice(-20).map((t) => (t.role === "user" ? new HumanMessage(t.content) : new AIMessage(t.content)))];
  if (opts.transcript.length === 0) msgs.push(new HumanMessage("Let's start."));
  const res = await new ChatOpenAI({ modelName: "gpt-4o-mini", temperature: 0.5, openAIApiKey: process.env.OPENAI_API_KEY }).invoke(msgs);
  return contentOf(res).trim();
}
