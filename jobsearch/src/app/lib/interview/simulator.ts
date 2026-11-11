import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import { extractJson } from "@/app/lib/resume/tailor";
import type { InterviewPlan, StageKey } from "./prepare";
import type { CompanyContext } from "./companyContext";
import { chatModel } from "@/app/lib/llm/chat";
import { modelFor } from "@/app/lib/llm/models";
import { hebrewRule } from "@/app/lib/llm/hebrew";

/**
 * The mock-interview agent. Unlike the old "practice" chat it behaves like a
 * real interviewer from the company: it knows the company and the role, asks
 * one question at a time, follows up, and gives NO feedback until the
 * interview is over — then it writes a full debrief.
 */
/** `kind` (interviewer turns, chat mode): a follow-up or clarification does not count against the question budget. */
export type SessionTurn = { role: "interviewer" | "candidate"; content: string; kind?: "main" | "followup" };

export const END_MARK = "<<END>>";
/** The interviewer marks a follow-up / clarification turn (private; stripped before the candidate sees it), so it is not counted as a main question. */
export const FOLLOWUP_MARK = "<<FOLLOWUP>>";
/** Main questions asked so far: interviewer turns minus the ones marked as follow-ups. */
export const mainQuestionsAsked = (transcript: SessionTurn[]) => transcript.filter((t) => t.role === "interviewer" && t.kind !== "followup").length;
/** The interviewer asks the system to hand the candidate a timed coding exercise (technical stages, chat mode). */
export const CODE_MARK = "<<CODE_TASK>>";
/** A candidate turn that carries the solution back into the conversation starts with this. */
export const CODE_SUBMITTED_PREFIX = "[CODE SUBMITTED]";

/**
 * Interviewers have characters. The style is picked once per interview (and
 * stored on the session) so the candidate meets different people over time:
 * the warm chatty one, the dry formal one, the skeptic, the clock-watcher.
 */
export const STYLES = ["warm", "dry", "probing", "brisk"] as const;
export type InterviewerStyle = (typeof STYLES)[number];
const STYLE_RULES: Record<InterviewerStyle, string> = {
  warm: "STYLE — warm and talkative: you sound like you enjoy the conversation, react with a short personal remark before moving on, now and then share one sentence about how the team actually works; still one question at a time.",
  dry: "STYLE — dry and formal: minimal reactions ('Okay.', 'Noted.'), no small talk, precise questions, and you never fill a silence with encouragement; the candidate has to carry the conversation.",
  probing: "STYLE — skeptical and probing: you take nothing at face value. When they claim something you ask for the specific example, the number, and their own part in it; you push back politely on vague answers ('that's the team — what did YOU do?').",
  brisk: "STYLE — brisk and time-boxed: you run a tight schedule, keep answers moving ('let's keep this one short'), cut tangents off politely, and cover more ground with shorter questions.",
};
const STYLE_POOL: Record<string, InterviewerStyle[]> = {
  hr: ["warm", "brisk", "warm", "dry"],
  technical: ["probing", "dry", "brisk", "warm"],
  system_design: ["probing", "dry", "probing", "warm"],
  behavioral: ["probing", "warm", "dry"],
  home_assignment: ["probing", "warm", "dry"],
  final: ["dry", "warm", "brisk"],
};
export const isStyle = (s: unknown): s is InterviewerStyle => (STYLES as readonly string[]).includes(String(s));
export function pickStyle(stage: string, seed = Math.random()): InterviewerStyle {
  const pool = STYLE_POOL[stage] || STYLE_POOL.hr;
  return pool[Math.floor(seed * pool.length) % pool.length];
}

/**
 * How each stage really runs (the common Israeli tech interview funnel; the
 * question bank and the plan fill the slots). The opening is shared: the
 * interviewer presents the company, then the role, then asks the candidate
 * to introduce themselves. Phases are an order, not a checklist read aloud.
 */
export const STAGE_SCRIPT: Record<string, string[]> = {
  hr: [
    "Résumé walk-through: their path so far, the last two roles, why they left or want to leave.",
    "REQUIREMENT GAPS: compare the posting's requirements with the résumé and ask, neutrally, about each material gap (a technology they don't list, fewer years than asked, a different domain) — 'the role asks for X, I don't see it in your CV; how close are you?'.",
    "Motivation: why this role, why this company specifically (expect them to know what the company does), what they look for in the next job.",
    "Expectations and logistics: salary expectations (ask for a number or a range), availability / notice period, on-site vs hybrid, location, any constraints (studies, reserve duty, other processes).",
    "Their questions about the role and the process.",
  ],
  technical: [
    "Warm-up: 2 fundamentals questions from the role's stack (the REAL QUESTIONS list first, then the question bank).",
    "Deep-dive on one project from the résumé: their own part, the hardest decision, what broke, what they'd change.",
    "Hands-on task: the coding exercise (hand it out with the token when allowed; in a voice call, give a small problem to reason through aloud). GUIDANCE IS ALLOWED HERE: if they are stuck, give one small hint at a time ('what if you used a map?'), never the solution; note that they needed hints.",
    "Follow-ups on the solution: complexity, edge cases, tests, what they'd do with more time.",
    "Their questions about the team's stack and practices.",
  ],
  system_design: [
    "Problem statement and requirements clarification: expect them to ask about scale, users, latency, consistency before designing.",
    "High-level design: components, data flow, API surface; ask them to think aloud.",
    "Deep-dive on one component they chose (storage, queue, cache): schema, trade-offs.",
    "Scale and failure: what breaks at 10×, single points of failure, monitoring; one hint when stuck is fine.",
    "Their questions.",
  ],
  home_assignment: [
    "Walk-through: ask them to present the solution in 3–4 minutes — structure, main decisions.",
    "Decisions and trade-offs: why this architecture / library / data model; what they considered and rejected.",
    "Quality: tests, error handling, edge cases, how they'd deploy it; point at a specific weak spot and ask about it.",
    "Extension: 'if we now needed X, what changes?' (a realistic new requirement).",
    "Their questions.",
  ],
  behavioral: [
    "Teamwork and conflict: a disagreement with a teammate or manager — what happened, what they did, how it ended (STAR: situation, task, action, result).",
    "Ownership and failure: something that went wrong on their watch, what they learned.",
    "Learning and feedback: a time they got hard feedback; how they learn a new technology.",
    "Working under pressure / priorities: a deadline story, how they chose what to drop.",
    "Their questions about the team.",
  ],
  final: [
    "Career story and motivation in their own words: where they want to be in two or three years and why this company fits that.",
    "Culture and values: how they work with product and other teams, what environment they do their best work in.",
    "Expectations: salary, start date, other offers in play — straight questions.",
    "Closing sell: tell them briefly why people stay at the company, then their questions.",
  ],
};

/** How deep an interviewer may dig into one subject at each stage (follow-ups after a main question). */
export const FOLLOWUP_BUDGET: Record<string, number> = { hr: 1, behavioral: 2, technical: 3, system_design: 3, home_assignment: 2, final: 1 };

/**
 * Adaptive difficulty from the live per-answer reviews (0–10, in order):
 * two thin answers in a row → step down; two strong ones → step up.
 */
export function adaptiveSteer(scores: number[]): { steer: "step_down" | "step_up" | null; note: string } {
  const last = scores.slice(-2);
  if (last.length === 2 && last.every((x) => x <= 4)) {
    return { steer: "step_down", note: "The last two answers were thin (scored ≤ 4/10). STEP DOWN for the next question: a shorter, more concrete, open question on something they clearly know from their résumé; help them get a good answer out before you climb again." };
  }
  if (last.length === 2 && last.every((x) => x >= 7)) {
    return { steer: "step_up", note: "The last two answers were strong (≥ 7/10). STEP UP: push to the next level — trade-offs, what breaks at 10× scale, failure modes, 'what would you do differently with what you know now', the part of the design they did not mention." };
  }
  return { steer: null, note: "" };
}

export const INTERVIEWER_MODEL = modelFor("interviewer");
export const FEEDBACK_MODEL = modelFor("coach");

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
  /** Specific things to test again, from the previous interviews' weak spots (coachMemory.ts → retestItems). */
  retest?: string[];
  /** The interviewer's character for this session (pickStyle). */
  style?: InterviewerStyle;
  /** Scores of the answers reviewed so far (0–10, in order): drives adaptive difficulty. */
  liveScores?: number[];
  /** Whether a timed coding exercise may be handed out, and what happened with it. */
  codeTask?: { allowed: boolean; done: boolean; title?: string; score?: number | null };
  /** Questions the company really asks (lib/interview/realQuestions.ts): the interviewer must use them. */
  realQuestions?: { text: string; count: number; stageCount: number };
  /** The posting's stated requirements and technologies (for the HR gap questions). */
  jobRequirements?: string[];
  /** The posting text (excerpt), so the interviewer can present the role in its own words. */
  jobDescription?: string;
};

/** A compact, factual brief the interviewer can quote from. */
export function buildCompanyBrief(plan: InterviewPlan, ctx?: CompanyContext | null, research?: string | null, reportedQuestions?: string | null): string {
  const lines = [
    research && `RESEARCH (web):\n${research}`,
    reportedQuestions && `REAL QUESTIONS candidates report being asked at this company (weave several of these in, in your own words, at the right stage):\n${reportedQuestions}`,
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
  const asked = mainQuestionsAsked(input.transcript); // the opening counts here, follow-ups do not
  const who = input.interviewer ? `${input.interviewer.name} (${input.interviewer.gender}), ${persona.en}` : persona.en;
  const budget = FOLLOWUP_BUDGET[input.stage] ?? 1;
  // What was already asked, so the model never circles back; and a hard close when the budget is spent.
  const askedList = input.transcript.filter((t) => t.role === "interviewer" && t.kind !== "followup").slice(1).map((t, i) => `${i + 1}. ${t.content.replace(/\s+/g, " ").slice(0, 140)}`);
  const alreadyAsked = askedList.length ? `\n- ALREADY ASKED (never repeat or rephrase these subjects; every new main question is on a NEW subject):\n${askedList.join("\n")}` : "";
  const overBudget = asked > input.targetQuestions ? `\n- BUDGET SPENT: you have asked all ${input.targetQuestions} main questions. Do NOT ask anything else. Close the interview now in 1–2 sentences and append ${END_MARK}.` : "";
  const realN = input.realQuestions?.stageCount ? Math.min(3, input.realQuestions.stageCount, Math.max(1, input.targetQuestions - 1)) : 0;
  const realRule = realN
    ? `- REAL QUESTIONS FIRST: at least ${realN} of your ${input.targetQuestions} main questions MUST be questions from the REAL QUESTIONS list above (the ones marked FOR THIS STAGE), asked in your own words and in a natural order, adapted to this candidate's résumé. They take priority over the question bank. Never say they were reported or where they came from — to you they are simply what you ask.\n`
    : input.realQuestions?.count
      ? `- REAL QUESTIONS: nothing is reported for this stage yet; if one of the other-stage questions above fits this stage, use it.\n`
      : "";
  const steer = adaptiveSteer(input.liveScores || []);
  const live = input.liveScores?.length
    ? `\n- LIVE READ (your private hiring-committee notes so far, one score 0–10 per answered question, in order): [${input.liveScores.join(", ")}]. ${steer.note || "Keep the current level."} Never mention these notes.`
    : "";
  const retest = input.retest?.length
    ? `\n- RE-TEST (from their previous mock interviews — never mention that you know): ask, in your own words and in this stage's context, at least one question that tests: ${input.retest.slice(0, 2).join(" | ")}.`
    : "";
  const code = input.codeTask?.allowed
    ? input.codeTask.done
      ? `\n- CODING EXERCISE: done ("${input.codeTask.title || "exercise"}", automatic grade ${input.codeTask.score ?? "n/a"}/100). Do not hand out another one.`
      : `\n- CODING EXERCISE (once per interview): after at least 2 main questions and before your last one, hand the candidate a short timed coding exercise. Write ONE lead-in sentence ("I'd like to see you code something small now — you'll get it in a moment, take your time") and end that message with the exact token ${CODE_MARK}. Do not describe or invent the exercise yourself — the system presents it and the clock. When their solution comes back (a candidate turn starting with "${CODE_SUBMITTED_PREFIX}", with an automatic grade), spend your next 1–2 questions on it: why that approach, its complexity, an edge case, what they would change with more time. The exercise counts as one main question.`
    : "";
  return `
You are ${who} at ${input.job.company}, interviewing a candidate for "${input.job.title}". This is the "${stage.title}" stage${stage.description ? ` — ${stage.description}` : ""}.
Speak ${lang}. You ARE the interviewer, not a coach.${hebrewRule(input.language)}
${STYLE_RULES[input.style || "warm"]}

WHAT YOU KNOW ABOUT YOUR COMPANY (use it naturally — mention real products, stack and context when relevant; never invent facts beyond this):
"""
${input.companyBrief || "(no brief)"}
"""
ROLE SUMMARY: ${input.plan.roleSummary || "(see title)"}
CANDIDATE'S RÉSUMÉ (ask about specifics from it): """${(input.resumeText || "").slice(0, 3000)}"""
THE ROLE AS POSTED: """${(input.jobDescription || "").slice(0, 1800) || "(see role summary)"}"""
${input.jobRequirements?.length ? `REQUIREMENTS STATED IN THE POSTING: ${input.jobRequirements.slice(0, 12).join(" | ")}` : ""}
INTERVIEW SCRIPT for this stage, in order (the opening comes first; the REAL QUESTIONS and the question bank fill the slots; do not announce the phases):
${(STAGE_SCRIPT[input.stage] || STAGE_SCRIPT.hr).map((s, i) => `${i + 1}. ${s}`).join("\n")}
RÉSUMÉ GAPS: read the résumé like a real interviewer and, if you notice a MATERIAL gap, ask about it once as one of your main questions, neutrally and without accusation — e.g. an unexplained break of months or more between roles or after studies, a very short stint, overlapping jobs, studies with no dates or no degree, a listed skill or title with nothing in the experience to back it, or a switch of field. Phrase it as curiosity ("I see about a year between X and Y — what were you doing then?"), listen, and move on; do not probe it more than once unless the answer was evasive. If nothing in the résumé is genuinely surprising, do not invent a gap.
${input.coachMemory ? `WHAT THE COACH REMEMBERS FROM THEIR PREVIOUS MOCK INTERVIEWS (use it to probe the weak spots again — naturally, never mention that you know): ${input.coachMemory}` : ""}
${input.realQuestions?.text ? `${input.realQuestions.text}\n` : ""}QUESTION BANK FOR THIS STAGE (adapt, don't read verbatim; you may add your own): ${stage.likelyQuestions.map((q) => q.question).slice(0, 10).join(" | ")}

HOW TO BEHAVE:
- Ask exactly ONE question per message. Keep messages short (under 90 words), conversational, like a real person.
- React briefly and neutrally to the previous answer ("Got it.", "Interesting — and…").
- FOLLOW-UP BUDGET for this stage: up to ${budget} follow-up${budget === 1 ? "" : "s"} on the same subject after a main question. Spend them when an answer was thin, vague or evasive (ask for the example, the number, their own part in it) OR when it was strong and invites depth (a trade-off, what breaks at scale, what they'd do differently). A complete, concrete answer to an easy question needs no follow-up — acknowledge and move to the NEXT main question on a different subject. Never exceed the budget; never stay on one subject for more than ${budget + 1} questions in a row.
${realRule}${alreadyAsked}${overBudget}
- COMPANY-ANCHORED QUESTIONS: at least two of your main questions must be anchored in a specific item from what you know — a product, a recent news item, their stack, a signal from their open roles, or a sentence from the role summary ("we use X for Y — how would you approach Z?"). Only from the brief above, never invented; when the brief is thin, anchor in the role summary and the posting's title.${live}${retest}${code}
- CLARIFY WHEN NEEDED: if an answer is unclear, incomplete or you did not understand it, ask a short clarifying follow-up ("do you mean…?", "can you give the concrete example?") — that does not count against the budget. Never pretend you understood.
- FOLLOW-UP MARK: when your message is a follow-up or a clarification on the subject of your previous question (not a new main question), append the exact token ${FOLLOWUP_MARK} at the very end of it. It is private — the candidate never sees it — and it is how the system knows the message does not count as a main question. A new main question carries no token.
- Do NOT evaluate, grade, coach or say how the candidate is doing. Feedback comes only after the interview. The one exception is the hands-on task in a technical stage: a small hint when they are stuck is allowed (the script says so), the solution is not.
- Stay in character even if the candidate asks for feedback: politely say you'll share impressions at the end.
- If the candidate asks YOU something (about the company, the team, the role, the process, salary range you don't know…), answer it briefly and honestly from what you know — say "I don't have that information" when you don't — then give them room to react before moving on. Candidates are expected to ask questions; it's a good sign.
- Plan for ${input.targetQuestions} main questions (your opening and the candidate's self-introduction do NOT count; follow-ups and clarifications do not count either). Main questions asked so far, including the opening: ${asked}. When you have asked all of them and received the last answer — or when the candidate asks to stop — close the interview in 1–2 sentences (thank them, say what happens next) and append the exact token ${END_MARK} at the very end of that message.
- OPENING (when the transcript is empty), in this order and in one message: (1) introduce yourself by name and role; (2) tell them about ${input.job.company} — what it does, for whom, size/stage, from the brief, 2–3 sentences; (3) present the "${input.job.title}" role — what the person will do, the team, the stack, from the posting, 2–3 sentences — and what this stage is about; (4) ask them to tell you about themselves — and STOP there. Your first real question comes only after they have introduced themselves.`.trim();
}

const contentOf = (res: any): string => (typeof res.content === "string" ? res.content : (res.content as any[]).map((p) => p?.text ?? "").join(""));

export async function interviewerTurn(input: SimInput): Promise<{ message: string; done: boolean; codeTask: boolean; followUp: boolean }> {
  const msgs = [new SystemMessage(buildInterviewerPrompt(input)), ...input.transcript.slice(-30).map((t) => (t.role === "candidate" ? new HumanMessage(t.content) : new AIMessage(t.content)))];
  if (input.transcript.length === 0) msgs.push(new HumanMessage(input.language === "en" ? "(The candidate has joined the call.)" : "(המועמד/ת נכנס/ה לשיחה.)"));
  const res = await chatModel("interviewer", { temperature: 0.6 }).invoke(msgs);
  const raw = contentOf(res).trim();
  const done = raw.includes(END_MARK);
  const codeTask = !done && raw.includes(CODE_MARK) && !!input.codeTask?.allowed && !input.codeTask.done;
  const followUp = !done && !codeTask && raw.includes(FOLLOWUP_MARK);
  return { message: raw.replace(END_MARK, "").replace(CODE_MARK, "").replace(FOLLOWUP_MARK, "").trim(), done, codeTask, followUp };
}

export const feedbackSchema = z.object({
  overallScore: z.number().min(0).max(100),
  /** Voice interviews only: how it sounded. */
  delivery: z.object({ score: z.number().min(0).max(10), notes: z.string().default("") }).optional(),
  /** Voice interviews with the camera on: how it looked (eye contact, expression, stillness). */
  presence: z.object({ score: z.number().min(0).max(10), notes: z.string().default("") }).optional(),
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
  /** Attached after the model wrote the debrief (lib/interview/peers.ts). */
  peerComparison: z.any().optional(),
  calibration: z.any().optional(),
  /** The coding exercise handed out mid-interview, when there was one. */
  codeTask: z.object({ title: z.string(), score: z.number().nullable(), verdict: z.string().default("") }).optional(),
});
export type InterviewFeedback = z.infer<typeof feedbackSchema>;

export const answerReviewSchema = z.object({
  question: z.string(),
  answerSummary: z.string().default(""),
  score: z.number().min(0).max(10),
  whatWorked: z.string().default(""),
  betterAnswer: z.string().default(""),
  /** Whether the question opened a new subject or dug into the previous one (the voice call's question budget counts only "main"). */
  kind: z.enum(["main", "follow_up", "clarification"]).default("main"),
});
export type AnswerReview = z.infer<typeof answerReviewSchema>;

/**
 * Review ONE question/answer pair (cheap, fast model). Called while the
 * interview is still running so the final debrief has almost nothing left
 * to write when the candidate hangs up.
 */
export async function reviewAnswer(input: { question: string; answer: string; previousQuestion?: string; job: { title: string; company: string }; stage: string; resumeText?: string; language: "he" | "en" }): Promise<AnswerReview> {
  const lang = input.language === "en" ? "English" : "Hebrew (technical terms in English)";
  const system = `You are an interviewer at ${input.job.company} reviewing one answer from a "${input.stage}" interview for ${input.job.title}. Write in ${lang}. Be specific and fair; quote what they said. Score 0–10 (7+ = solid). "betterAnswer": a stronger version in the candidate's own voice, 3–5 sentences, using ONLY their real experience from the résumé — never invent. The answer is a speech transcript: ignore small transcription slips.
"kind": "main" when the question opened a new subject; "follow_up" when it dug deeper into the subject of the previous question; "clarification" when it only asked the candidate to clarify or repeat.
Return STRICT JSON: {"question","answerSummary","score","whatWorked","betterAnswer","kind"}.${hebrewRule(input.language)}`;
  const user = `RÉSUMÉ:\n${(input.resumeText || "").slice(0, 2500)}\n\n${input.previousQuestion ? `PREVIOUS QUESTION: ${input.previousQuestion}\n\n` : ""}QUESTION: ${input.question}\n\nANSWER: ${input.answer}`;
  const res = await chatModel("quality", { temperature: 0.2, maxTokens: 1500, json: true }).invoke([new SystemMessage(system), new HumanMessage(user)]); // a Hebrew review with a better answer is ~1k tokens
  const parsed = answerReviewSchema.safeParse(extractJson(contentOf(res)));
  if (!parsed.success) throw new Error("Answer review invalid");
  return { ...parsed.data, question: parsed.data.question || input.question };
}

export function buildFeedbackPrompt(input: Omit<SimInput, "targetQuestions"> & { deliveryNote?: string; priorReviews?: AnswerReview[]; compact?: boolean; calibrationNote?: string }): { system: string; user: string } {
  const memory = input.coachMemory
    ? `\nThis candidate has done mock interviews before: ${input.coachMemory}. Add "progress": {"note": one honest paragraph comparing this interview to the previous ones (score, delivery, the recurring themes), "improved": [themes that got better], "stillOpen": [themes still showing]}. Be concrete; "no change" is a valid answer.`
    : "";
  const stage = input.plan.stages.find((s) => s.key === input.stage) || input.plan.stages[0];
  const lang = input.language === "en" ? "English" : "Hebrew (technical terms in English)";
  const hasCamera = !!input.deliveryNote && /CAMERA \(measured/.test(input.deliveryNote);
  const voice = input.deliveryNote
    ? `\nThis was a SPOKEN interview (transcribed). Also score "delivery" 0–10 with notes on VOICE and TONE: pace, filler words, pauses, answer length, pitch variation (monotone vs expressive), volume, trailing off, and the confidence/energy/clarity the interviewer heard — based on these measurements and impressions: ${input.deliveryNote}. Give 2–3 concrete, practical voice tips (e.g. "end sentences with a downward tone", "slow down on numbers"). Transcription may contain small errors; don't penalise typos.${hasCamera ? ` The candidate also had the camera on: score "presence" 0–10 with notes on what the camera showed — eye contact (looking at the camera vs. away or down), facial expression (smile, furrowed brow, tension), stillness vs. restlessness, framing — and 2 practical tips (e.g. "look at the lens when you finish a sentence", "sit a bit further from the screen"). Base it only on the CAMERA measurements above; be kind and specific.` : ""}`
    : "";
  const system = `You are the interviewer who just finished a "${stage.title}" interview for ${input.job.title} at ${input.job.company}, now writing the hiring-committee debrief AND an honest, useful debrief for the candidate. Write in ${lang}.
Be specific and fair: quote what the candidate actually said; do not reward fluent nonsense; do not punish brevity when the content was right. Score the whole interview 0–100 (70+ = would advance; 50–69 = borderline; below 50 = would not advance), each dimension 0–10, each answer 0–10.
Calibration: an answer with no concrete example, number, decision or trade-off ("I'm a fast learner", "it's a great company", "it wasn't hard") scores at most 4/10; an interview where most answers are like that scores below 50 overall, however pleasant the tone. "I don't know" is honest and scores above a confident wrong answer, but still low.${input.calibrationNote ? `\n${input.calibrationNote}` : ""}${input.codeTask?.done ? `\nThe interview included a timed coding exercise ("${input.codeTask.title || "exercise"}") graded automatically ${input.codeTask.score ?? "n/a"}/100; its turn starts with "${CODE_SUBMITTED_PREFIX}". Weigh it as one main question and review the follow-up discussion about the code like any other answer.` : ""}
Dimensions to score for this stage: ${input.stage === "technical" || input.stage === "system_design" ? "technical depth, problem solving, communication, trade-off thinking, role fit" : input.stage === "hr" ? "motivation & fit, communication, clarity about experience, expectations alignment, professionalism" : "communication, concrete examples, ownership, collaboration, role fit"}.
${input.priorReviews?.length ? `The per-question reviews were already written during the interview (below); base the rest on them and return "answerReviews": [] (they are attached afterwards, do not repeat them).` : "For every main question give: a one-line summary of the answer, a score, what worked, and a stronger answer in the candidate's own voice (3–5 sentences, using THEIR real experience from the résumé — never invent experience)."}${input.compact ? "\nKeep it tight: summary ≤ 120 words, ≤ 4 strengths, ≤ 4 improvements, ≤ 4 next steps, each note ≤ 40 words, betterAnswer ≤ 3 sentences." : ""}${voice}${memory}
Return STRICT JSON: {"overallScore": number, "verdict": string, "summary": string, "dimensions": [{"name","score","notes"}], "strengths": [string], "improvements": [string], "answerReviews": [{"question","answerSummary","score","whatWorked","betterAnswer"}], "nextSteps": [string]${input.deliveryNote ? ', "delivery": {"score": number, "notes": string}' : ""}${hasCamera ? ', "presence": {"score": number, "notes": string}' : ""}${input.coachMemory ? ', "progress": {"note": string, "improved": [string], "stillOpen": [string]}' : ""}}. Nothing else.${hebrewRule(input.language)}`;
  const user = `COMPANY BRIEF:\n${input.companyBrief}\n\nCANDIDATE RÉSUMÉ:\n${(input.resumeText || "").slice(0, 3000)}\n\nTRANSCRIPT:\n${input.transcript.map((t) => `${t.role === "interviewer" ? "INTERVIEWER" : "CANDIDATE"}: ${t.content}`).join("\n\n")}${input.priorReviews?.length ? `\n\nPER-QUESTION REVIEWS (already done):\n${JSON.stringify(input.priorReviews)}` : ""}`;
  return { system, user };
}

/** Output budget for the debrief. Hebrew costs ~2–3 tokens per word, so a long interview with per-answer reviews can run past 4k. */
const FEEDBACK_MAX_TOKENS = 8000;

export async function finalFeedback(input: Omit<SimInput, "targetQuestions"> & { deliveryNote?: string; priorReviews?: AnswerReview[]; calibrationNote?: string }): Promise<InterviewFeedback> {
  const ask = async (compact: boolean) => {
    const { system, user } = buildFeedbackPrompt({ ...input, compact });
    const res = await chatModel("coach", { temperature: 0.2, maxTokens: FEEDBACK_MAX_TOKENS, timeout: 120_000, maxRetries: 1, json: true }).invoke([new SystemMessage(system), new HumanMessage(user)]);
    const raw = contentOf(res);
    const finish = (res as any)?.response_metadata?.finish_reason ?? (res as any)?.additional_kwargs?.finish_reason;
    if (finish === "length" || (res as any)?.response_metadata?.stop_reason === "max_tokens") throw new Error("truncated");
    return extractJson(raw);
  };
  let json: unknown;
  try {
    json = await ask(false);
  } catch (e) {
    // A cut-off or malformed JSON (typically a very long interview): one retry asking for a compact debrief.
    console.warn("[interview] debrief retry (compact):", (e as Error)?.message?.slice(0, 120));
    json = await ask(true);
  }
  const parsed = feedbackSchema.safeParse(json);
  if (!parsed.success) throw new Error("Feedback output invalid: " + parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).slice(0, 5).join("; "));
  // The reviews written live are the source of truth for the per-question part.
  if (input.priorReviews?.length) parsed.data.answerReviews = input.priorReviews;
  return parsed.data;
}
