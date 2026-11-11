import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import { extractJson } from "@/app/lib/resume/tailor";
import { seniorityOf } from "@/app/lib/jobTaxonomy";
import type { CompanyContext } from "./companyContext";
import { chatModel } from "@/app/lib/llm/chat";
import { modelFor } from "@/app/lib/llm/models";
import { hebrewRule } from "@/app/lib/llm/hebrew";

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
  /** Output of the research agent (companyResearch.ts → researchToText), when available. */
  research?: string;
  /** Questions candidates reported being asked at this company (lib/outcomes/questions.ts → reportedQuestionsText). */
  reportedQuestions?: string;
  resumeText?: string;
  language?: "he" | "en";
};

const MAX = 6000;
export const PREP_MODEL = modelFor("quality");

const RULES = (input: PrepInput) => {
  const lang = input.language === "en" ? "English" : "Hebrew";
  const level = seniorityOf(input.job.title, input.job.seniority);
  return `You are an expert interview coach for software/tech roles in Israel. You are preparing ONE candidate for ONE job.

RULES
- Write all explanatory text in ${lang}; keep technical terms, tool names and code in English.
- Ground everything in the provided posting, company context and résumé. Do not invent facts about the company; when unsure, say what to verify.
- Tailor to the level: ${level}. For junior roles emphasise fundamentals, a possible home assignment / online test, and how to present projects.${hebrewRule(input.language || "he")}`;
};

/** Everything the coach knows: the posting, the company, the research brief, reported questions, the résumé. Shared by every call. */
function contextBlock(input: PrepInput): string {
  const cc = input.companyContext;
  return `JOB — ${input.job.title} at ${input.job.company}
"""
${(input.job.description || "").slice(0, MAX)}
"""

COMPANY CONTEXT (from our catalog and the company website)
- Open roles in our catalog: ${cc.openRoles}; sample titles: ${cc.sampleTitles.join(" | ") || "-"}
- Tech signals across their postings: ${cc.techSignals.map((t) => `${t.term}(${t.count})`).join(", ") || "-"}
- Website: ${cc.domain || "-"}
- Website excerpt: ${cc.websiteExcerpt ? cc.websiteExcerpt.slice(0, 2500) : "(not available)"}
${input.research ? `\nRESEARCH BRIEF (web research, use it for company.summary/cultureHints and for stage-specific questions about recent news/products)\n${input.research}\n` : ""}${input.reportedQuestions ? `\nREAL QUESTIONS reported by candidates after interviews at this company — include them (verbatim or lightly rephrased) in the matching stage's likelyQuestions before your own guesses:\n${input.reportedQuestions}\n` : ""}
CANDIDATE RÉSUMÉ
"""
${(input.resumeText || "(no résumé on file — keep sample answers generic and say what to prepare)").slice(0, MAX)}
"""`;
}

type StageStub = { key: StageKey; title: string; description?: string; durationHint?: string };
const stubSchema = z.object({ key: z.enum(STAGE_KEYS), title: z.string(), description: z.string().default(""), durationHint: z.string().optional() });

/**
 * The plan is written in three kinds of calls so it arrives in ~40s instead
 * of minutes (one reply holding the whole plan is ~10k Hebrew tokens, and
 * used to be cut off mid-JSON):
 *   1. which stages, in which order (tiny reply)
 *   2. in parallel: the overview (company, role, gaps, questions to ask,
 *      checklist) and one call per stage (its questions and tips)
 */
export function buildStagesPrompt(input: PrepInput): { system: string; user: string } {
  const system = `${RULES(input)}
- Choose 4-6 stages from ${STAGE_KEYS.join(", ")} in the order this company most likely runs its process for this role (use the research brief and reported questions when they say how the process goes). For each: a short title in the output language, a 1-2 sentence description of what happens and what is assessed, and a duration hint.

OUTPUT strict JSON only:
{"stages":[{"key":"hr","title":"","description":"","durationHint":""}]}`;
  return { system, user: `${contextBlock(input)}\n\nReturn the JSON.` };
}

/** The overview: company, role, gaps, questions to ask, checklist. `stages` (already chosen) is echoed so the plan parses whole. */
export function buildPrepPrompt(input: PrepInput, stages: StageStub[] = []): { system: string; user: string } {
  const system = `${RULES(input)}
- Keep it tight, this is a briefing not an essay: company.summary ≤ 60 words, whatTheyDo ≤ 40 words, techStack ≤ 8 short items, cultureHints ≤ 6 short items, roleSummary ≤ 80 words.
- gaps: up to 5 skills/topics the posting wants that the résumé doesn't show, each with whyItMatters (≤ 25 words) and a studyPlan (what to learn, how, how long; ≤ 40 words).
- questionsToAsk: 5-6 smart questions for the candidate to ask. checklist: up to 8 logistics and must-dos before the interview.
${stages.length ? `- The interview stages were already chosen: ${stages.map((s) => `${s.key} ("${s.title}")`).join(", ")}. Do not list stages; their questions are written separately.` : ""}
OUTPUT strict JSON only:
{"company":{"summary":"","whatTheyDo":"","techStack":[],"cultureHints":[]},"roleSummary":"","gaps":[{"topic":"","whyItMatters":"","studyPlan":""}],"questionsToAsk":[],"checklist":[]}`;
  return { system, user: `${contextBlock(input)}\n\nReturn the JSON overview.` };
}

/** One stage's questions and tips. */
export function buildStagePrompt(input: PrepInput, stage: StageStub, allStages: string[], compact = false): { system: string; user: string } {
  const system = `${RULES(input)}
- You are writing ONE stage of the plan: "${stage.title}" (${stage.key}). The other stages (${allStages.join(", ")}) are written separately — stay within this stage's scope and do not repeat their ground.
- likelyQuestions: ${compact ? "4" : "4-6"} questions this stage really asks for this role at this company (reported real questions first, when they belong to this stage), each with whyAsked (≤ 15 words) and howToAnswer (${compact ? "≤ 30 words" : "≤ 50 words"}); a sampleAnswer in the candidate's own voice for the ${compact ? "single most important question (≤ 60 words)" : "2 most important ones (≤ 90 words each, from the candidate's real résumé, never invented experience)"}; omit sampleAnswer for the rest.
- tips: ${compact ? "≤ 3" : "3-4"} concrete tips for this stage, ≤ 20 words each.

OUTPUT strict JSON only:
{"likelyQuestions":[{"question":"","whyAsked":"","howToAnswer":"","sampleAnswer":""}],"tips":[]}`;
  const user = `${contextBlock(input)}

STAGE TO WRITE
- key: ${stage.key}
- title: ${stage.title}
- what happens: ${stage.description || "-"}

Return the JSON for this stage.`;
  return { system, user };
}

/** Hebrew costs ~1.7 chars per token on Claude, so the caps are generous; the prompts bound the length. */
const STAGES_MAX_TOKENS = 2000;
const OVERVIEW_MAX_TOKENS = 6000;
const STAGE_MAX_TOKENS = 8000;
export const PLAN_MAX_TOKENS = STAGE_MAX_TOKENS;
const llm = (maxTokens: number) => chatModel("quality", { temperature: 0.3, maxTokens, timeout: 90_000, maxRetries: 0, json: true });
const contentOf = (res: any): string => (typeof res.content === "string" ? res.content : (res.content as any[]).map((p) => p?.text ?? "").join(""));
const truncated = (res: any) => res?.response_metadata?.finish_reason === "length" || res?.response_metadata?.stop_reason === "max_tokens";

async function askJson<T>(prompt: { system: string; user: string }, maxTokens: number, parse: (raw: any) => T): Promise<T> {
  const res = await llm(maxTokens).invoke([new SystemMessage(prompt.system), new HumanMessage(prompt.user)]);
  if (truncated(res)) throw new Error("truncated");
  return parse(extractJson(contentOf(res)));
}
const stageFillSchema = z.object({ likelyQuestions: z.array(questionSchema).default([]), tips: z.array(z.string()).default([]) });
const overviewSchema = planSchema.omit({ stages: true });

export async function generateInterviewPlan(input: PrepInput): Promise<InterviewPlan> {
  // 1. the stages
  const stubs = await askJson(buildStagesPrompt(input), STAGES_MAX_TOKENS, (raw) => {
    const list = z.array(stubSchema).min(2).safeParse(raw?.stages);
    if (!list.success) throw new Error(`Stages output invalid: ${list.error.issues.map((i) => i.path.join(".") + " " + i.message).slice(0, 3).join("; ")}`);
    return list.data;
  });
  const titles = stubs.map((s) => s.title);
  let failedStages = 0;
  // 2. the overview and every stage, together
  const [overview, stages] = await Promise.all([
    askJson(buildPrepPrompt(input, stubs), OVERVIEW_MAX_TOKENS, (raw) => {
      const parsed = overviewSchema.safeParse(raw);
      if (!parsed.success) throw new Error(`Plan output invalid: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).slice(0, 5).join("; ")}`);
      return parsed.data;
    }),
    Promise.all(
      stubs.map(async (stage) => {
        const fill = (compact: boolean) =>
          askJson(buildStagePrompt(input, stage, titles, compact), STAGE_MAX_TOKENS, (raw) => {
            // A model (or a test double) may answer with a whole plan; take this stage out of it.
            const own = Array.isArray(raw?.stages) ? raw.stages.find((s: any) => s?.key === stage.key) : null;
            return stageFillSchema.parse(own || raw);
          });
        try {
          const r = await fill(false).catch((e) => {
            console.warn(`[interview] stage ${stage.key} retry (compact):`, (e as Error)?.message?.slice(0, 120));
            return fill(true);
          });
          return { ...stage, likelyQuestions: r.likelyQuestions, tips: r.tips };
        } catch (e) {
          console.error(`[interview] stage ${stage.key} failed twice:`, (e as Error)?.message?.slice(0, 200));
          failedStages++;
          return { ...stage, likelyQuestions: [], tips: [] }; // the page still opens; the stage says it has no questions
        }
      })
    ),
  ]);
  if (failedStages === stubs.length) throw new Error("Plan generation failed: every stage call failed");
  return { ...overview, stages };
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
If the transcript is empty, open with a one-line intro and the first question.${hebrewRule(opts.language || "he")}`.trim();
  const msgs = [new SystemMessage(system), ...opts.transcript.slice(-20).map((t) => (t.role === "user" ? new HumanMessage(t.content) : new AIMessage(t.content)))];
  if (opts.transcript.length === 0) msgs.push(new HumanMessage("Let's start."));
  const res = await chatModel("interviewer", { temperature: 0.5 }).invoke(msgs);
  return contentOf(res).trim();
}
