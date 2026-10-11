import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import { extractJson } from "@/app/lib/resume/tailor";
import type { InterviewPlan, StageKey } from "./prepare";
import type { CompanyContext } from "./companyContext";

/**
 * The mock-interview agent. Unlike the old "practice" chat it behaves like a
 * real interviewer from the company: it knows the company and the role, asks
 * one question at a time, follows up, and gives NO feedback until the
 * interview is over — then it writes a full debrief.
 */
export type SessionTurn = { role: "interviewer" | "candidate"; content: string };

export const END_MARK = "<<END>>";
export const INTERVIEWER_MODEL = "gpt-4o-mini";
export const FEEDBACK_MODEL = "gpt-4o";

const PERSONA: Record<string, { he: string; en: string }> = {
  hr: { he: "מגייס/ת HR", en: "HR recruiter" },
  technical: { he: "מהנדס/ת בכיר/ה בצוות", en: "senior engineer on the team" },
  home_assignment: { he: "ראש/ת הצוות שסוקר/ת את משימת הבית", en: "team lead reviewing the take-home assignment" },
  system_design: { he: "ארכיטקט/ית / Staff Engineer", en: "staff engineer / architect" },
  behavioral: { he: "מנהל/ת הגיוס (Hiring Manager)", en: "hiring manager" },
  final: { he: "סמנכ\"ל/ית או ראש/ת הקבוצה", en: "VP / group head" },
};

export type SimInput = {
  plan: InterviewPlan;
  stage: StageKey;
  job: { title: string; company: string };
  companyBrief: string;
  resumeText?: string;
  language: "he" | "en";
  targetQuestions: number;
  transcript: SessionTurn[];
  /** Who the interviewer is (name + gender drive the voice and the self-introduction). */
  interviewer?: { name: string; gender: "female" | "male" };
  /** The coach's memory of previous mock interviews (coachMemory.ts → memoryToText). */
  coachMemory?: string;
};

/** A compact, factual brief the interviewer can quote from. */
export function buildCompanyBrief(plan: InterviewPlan, ctx?: CompanyContext | null, research?: string | null): string {
  const lines = [
    research && `RESEARCH (web):\n${research}`,
    plan.company.summary && `About: ${plan.company.summary}`,
    plan.company.whatTheyDo && `What they do: ${plan.company.whatTheyDo}`,
    plan.company.techStack.length && `Tech stack: ${plan.company.techStack.join(", ")}`,
    plan.company.cultureHints.length && `Culture: ${plan.company.cultureHints.join("; ")}`,
    ctx?.techSignals?.length && `Technologies across their open roles: ${ctx.techSignals.slice(0, 12).map((t) => t.term).join(", ")}`,
    ctx?.openRoles ? `Open roles right now: ${ctx.openRoles}${ctx.sampleTitles?.length ? ` (e.g. ${ctx.sampleTitles.slice(0, 5).join(", ")})` : ""}` : "",
    ctx?.websiteExcerpt && `From their website: ${ctx.websiteExcerpt.slice(0, 900)}`,
  ].filter(Boolean) as string[];
  return lines.join("\n").slice(0, 5500);
}

export function buildInterviewerPrompt(input: SimInput): string {
  const stage = input.plan.stages.find((s) => s.key === input.stage) || input.plan.stages[0];
  const persona = PERSONA[input.stage] || PERSONA.hr;
  const lang = input.language === "en" ? "English" : "Hebrew (natural spoken register; technical terms in English)";
  const asked = input.transcript.filter((t) => t.role === "interviewer").length;
  const who = input.interviewer ? `${input.interviewer.name} (${input.interviewer.gender}), ${persona.en}` : persona.en;
  return `
You are ${who} at ${input.job.company}, interviewing a candidate for "${input.job.title}". This is the "${stage.title}" stage${stage.description ? ` — ${stage.description}` : ""}.
Speak ${lang}. You ARE the interviewer, not a coach.

WHAT YOU KNOW ABOUT YOUR COMPANY (use it naturally — mention real products, stack and context when relevant; never invent facts beyond this):
"""
${input.companyBrief || "(no brief)"}
"""
ROLE SUMMARY: ${input.plan.roleSummary || "(see title)"}
CANDIDATE'S RÉSUMÉ (ask about specifics from it): """${(input.resumeText || "").slice(0, 3000)}"""
${input.coachMemory ? `WHAT THE COACH REMEMBERS FROM THEIR PREVIOUS MOCK INTERVIEWS (use it to probe the weak spots again — naturally, never mention that you know): ${input.coachMemory}` : ""}
QUESTION BANK FOR THIS STAGE (adapt, don't read verbatim; you may add your own): ${stage.likelyQuestions.map((q) => q.question).slice(0, 10).join(" | ")}

HOW TO BEHAVE:
- Ask exactly ONE question per message. Keep messages short (under 90 words), conversational, like a real person.
- React briefly and neutrally to the previous answer ("Got it.", "Interesting — and…") and probe when an answer is vague, generic or evasive: ask for a concrete example, a number, a trade-off, or "what would you do differently".
- Do NOT evaluate, grade, coach, hint at the "right answer" or say how the candidate is doing. Feedback comes only after the interview.
- Stay in character even if the candidate asks for feedback: politely say you'll share impressions at the end.
- If the candidate asks YOU something (about the company, the team, the role, the process, salary range you don't know…), answer it briefly and honestly from what you know — say "I don't have that information" when you don't — then give them room to react before moving on. Candidates are expected to ask questions; it's a good sign.
- Plan for ${input.targetQuestions} main questions (your opening and the candidate's self-introduction do NOT count). Interviewer turns so far: ${asked}. When you have asked all of them and received the last answer — or when the candidate asks to stop — close the interview in 1–2 sentences (thank them, say what happens next) and append the exact token ${END_MARK} at the very end of that message.
- OPENING (when the transcript is empty): introduce yourself by name and role, say one or two sentences about ${input.job.company} and the "${input.job.title}" role and what this stage is about, then invite the candidate to introduce themselves briefly — and STOP there. Your first real question comes only after they have introduced themselves.`.trim();
}

const contentOf = (res: any): string => (typeof res.content === "string" ? res.content : (res.content as any[]).map((p) => p?.text ?? "").join(""));

export async function interviewerTurn(input: SimInput): Promise<{ message: string; done: boolean }> {
  const msgs = [new SystemMessage(buildInterviewerPrompt(input)), ...input.transcript.slice(-30).map((t) => (t.role === "candidate" ? new HumanMessage(t.content) : new AIMessage(t.content)))];
  if (input.transcript.length === 0) msgs.push(new HumanMessage(input.language === "en" ? "(The candidate has joined the call.)" : "(המועמד/ת נכנס/ה לשיחה.)"));
  const res = await new ChatOpenAI({ modelName: INTERVIEWER_MODEL, temperature: 0.6, openAIApiKey: process.env.OPENAI_API_KEY }).invoke(msgs);
  const raw = contentOf(res).trim();
  const done = raw.includes(END_MARK);
  return { message: raw.replace(END_MARK, "").trim(), done };
}

export const feedbackSchema = z.object({
  overallScore: z.number().min(0).max(100),
  /** Voice interviews only: how it sounded. */
  delivery: z.object({ score: z.number().min(0).max(10), notes: z.string().default("") }).optional(),
  /** When there were previous interviews: what changed since. */
  progress: z.object({ note: z.string().default(""), improved: z.array(z.string()).default([]), stillOpen: z.array(z.string()).default([]) }).optional(),
  verdict: z.string().default(""), // e.g. "strong hire / lean hire / lean no-hire"
  summary: z.string().default(""),
  dimensions: z.array(z.object({ name: z.string(), score: z.number().min(0).max(10), notes: z.string().default("") })).default([]),
  strengths: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([]),
  answerReviews: z
    .array(z.object({ question: z.string(), answerSummary: z.string().default(""), score: z.number().min(0).max(10), whatWorked: z.string().default(""), betterAnswer: z.string().default("") }))
    .default([]),
  nextSteps: z.array(z.string()).default([]),
});
export type InterviewFeedback = z.infer<typeof feedbackSchema>;

export const answerReviewSchema = z.object({
  question: z.string(),
  answerSummary: z.string().default(""),
  score: z.number().min(0).max(10),
  whatWorked: z.string().default(""),
  betterAnswer: z.string().default(""),
});
export type AnswerReview = z.infer<typeof answerReviewSchema>;

/**
 * Review ONE question/answer pair (cheap, fast model). Called while the
 * interview is still running so the final debrief has almost nothing left
 * to write when the candidate hangs up.
 */
export async function reviewAnswer(input: { question: string; answer: string; job: { title: string; company: string }; stage: string; resumeText?: string; language: "he" | "en" }): Promise<AnswerReview> {
  const lang = input.language === "en" ? "English" : "Hebrew (technical terms in English)";
  const system = `You are an interviewer at ${input.job.company} reviewing one answer from a "${input.stage}" interview for ${input.job.title}. Write in ${lang}. Be specific and fair; quote what they said. Score 0–10 (7+ = solid). "betterAnswer": a stronger version in the candidate's own voice, 3–5 sentences, using ONLY their real experience from the résumé — never invent. The answer is a speech transcript: ignore small transcription slips.
Return STRICT JSON: {"question","answerSummary","score","whatWorked","betterAnswer"}.`;
  const user = `RÉSUMÉ:\n${(input.resumeText || "").slice(0, 2500)}\n\nQUESTION: ${input.question}\n\nANSWER: ${input.answer}`;
  const res = await new ChatOpenAI({ modelName: "gpt-4o-mini", temperature: 0.2, maxTokens: 900, openAIApiKey: process.env.OPENAI_API_KEY, modelKwargs: { response_format: { type: "json_object" } } }).invoke([new SystemMessage(system), new HumanMessage(user)]);
  const parsed = answerReviewSchema.safeParse(extractJson(contentOf(res)));
  if (!parsed.success) throw new Error("Answer review invalid");
  return { ...parsed.data, question: parsed.data.question || input.question };
}

export function buildFeedbackPrompt(input: Omit<SimInput, "targetQuestions"> & { deliveryNote?: string; priorReviews?: AnswerReview[] }): { system: string; user: string } {
  const memory = input.coachMemory
    ? `\nThis candidate has done mock interviews before: ${input.coachMemory}. Add "progress": {"note": one honest paragraph comparing this interview to the previous ones (score, delivery, the recurring themes), "improved": [themes that got better], "stillOpen": [themes still showing]}. Be concrete; "no change" is a valid answer.`
    : "";
  const stage = input.plan.stages.find((s) => s.key === input.stage) || input.plan.stages[0];
  const lang = input.language === "en" ? "English" : "Hebrew (technical terms in English)";
  const voice = input.deliveryNote
    ? `\nThis was a SPOKEN interview (transcribed). Also score "delivery" 0–10 with notes on VOICE and TONE: pace, filler words, pauses, answer length, pitch variation (monotone vs expressive), volume, trailing off, and the confidence/energy/clarity the interviewer heard — based on these measurements and impressions: ${input.deliveryNote}. Give 2–3 concrete, practical voice tips (e.g. "end sentences with a downward tone", "slow down on numbers"). Transcription may contain small errors; don't penalise typos.`
    : "";
  const system = `You are the interviewer who just finished a "${stage.title}" interview for ${input.job.title} at ${input.job.company}, now writing the hiring-committee debrief AND an honest, useful debrief for the candidate. Write in ${lang}.
Be specific and fair: quote what the candidate actually said; do not reward fluent nonsense; do not punish brevity when the content was right. Score the whole interview 0–100 (70+ = would advance; 50–69 = borderline; below 50 = would not advance), each dimension 0–10, each answer 0–10.
Calibration: an answer with no concrete example, number, decision or trade-off ("I'm a fast learner", "it's a great company", "it wasn't hard") scores at most 4/10; an interview where most answers are like that scores below 50 overall, however pleasant the tone. "I don't know" is honest and scores above a confident wrong answer, but still low.
Dimensions to score for this stage: ${input.stage === "technical" || input.stage === "system_design" ? "technical depth, problem solving, communication, trade-off thinking, role fit" : input.stage === "hr" ? "motivation & fit, communication, clarity about experience, expectations alignment, professionalism" : "communication, concrete examples, ownership, collaboration, role fit"}.
${input.priorReviews?.length ? `The per-question reviews were already written during the interview (below); copy them into "answerReviews" UNCHANGED and base the rest on them.` : "For every main question give: a one-line summary of the answer, a score, what worked, and a stronger answer in the candidate's own voice (3–5 sentences, using THEIR real experience from the résumé — never invent experience)."}${voice}${memory}
Return STRICT JSON: {"overallScore": number, "verdict": string, "summary": string, "dimensions": [{"name","score","notes"}], "strengths": [string], "improvements": [string], "answerReviews": [{"question","answerSummary","score","whatWorked","betterAnswer"}], "nextSteps": [string]${input.deliveryNote ? ', "delivery": {"score": number, "notes": string}' : ""}${input.coachMemory ? ', "progress": {"note": string, "improved": [string], "stillOpen": [string]}' : ""}}. Nothing else.`;
  const user = `COMPANY BRIEF:\n${input.companyBrief}\n\nCANDIDATE RÉSUMÉ:\n${(input.resumeText || "").slice(0, 3000)}\n\nTRANSCRIPT:\n${input.transcript.map((t) => `${t.role === "interviewer" ? "INTERVIEWER" : "CANDIDATE"}: ${t.content}`).join("\n\n")}${input.priorReviews?.length ? `\n\nPER-QUESTION REVIEWS (already done):\n${JSON.stringify(input.priorReviews)}` : ""}`;
  return { system, user };
}

export async function finalFeedback(input: Omit<SimInput, "targetQuestions"> & { deliveryNote?: string; priorReviews?: AnswerReview[] }): Promise<InterviewFeedback> {
  const { system, user } = buildFeedbackPrompt(input);
  const res = await new ChatOpenAI({ modelName: FEEDBACK_MODEL, temperature: 0.2, maxTokens: 4000, timeout: 90_000, openAIApiKey: process.env.OPENAI_API_KEY, modelKwargs: { response_format: { type: "json_object" } } }).invoke([new SystemMessage(system), new HumanMessage(user)]);
  const parsed = feedbackSchema.safeParse(extractJson(contentOf(res)));
  if (!parsed.success) throw new Error("Feedback output invalid: " + parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).slice(0, 5).join("; "));
  // The reviews written live are the source of truth for the per-question part.
  if (input.priorReviews?.length) parsed.data.answerReviews = input.priorReviews;
  return parsed.data;
}
