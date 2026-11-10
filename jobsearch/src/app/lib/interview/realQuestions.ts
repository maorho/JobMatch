import { questionBank, type BankQuestion } from "@/app/lib/outcomes/questions";
import type { QuestionStage } from "@/app/models/InterviewQuestion";
import { ensureWebQuestions, webQuestionsAvailable, webQuestionsStatus } from "./webQuestions";

/**
 * The questions a company really asks, for the interviewer to use: what our
 * candidates reported after their interviews (the bank behind
 * /interview-questions) merged with what the web harvest found. When the bank
 * has nothing for the company and a search is due, the search runs now —
 * bounded, so starting an interview never waits more than `budgetMs` — and
 * whatever it finds lands in the bank for everyone.
 */

/** Plan stages → the bank's stages. */
export const BANK_STAGES: Record<string, QuestionStage[]> = {
  hr: ["hr"],
  behavioral: ["hr", "other"],
  technical: ["technical"],
  system_design: ["technical"],
  home_assignment: ["technical"],
  final: ["final", "other"],
};

export type RealQuestions = {
  /** The block for the interviewer prompt ("" when the bank is empty). */
  text: string;
  /** Distinct questions for the company, and how many match this stage. */
  count: number;
  stageCount: number;
  /** What happened with the web search: cached, ran now, timed out (keeps running), not available, or not needed. */
  harvest: "fresh" | "ran" | "timeout" | "unavailable" | "skipped";
};

const SAME_STAGE_MAX = 12;
const OTHER_STAGE_MAX = 6;
export const HARVEST_BUDGET_MS = 20_000; // the session start also pays for a model turn and must finish inside the route's 60 s

const line = (q: BankQuestion) => {
  const prov = q.count > 0 ? (q.count > 1 ? ` (reported by ${q.count} of our candidates)` : " (reported by one of our candidates)") : ` (seen on ${q.sources[0]?.name || "the web"})`;
  return `- [${q.stage}${q.topic ? ` · ${q.topic}` : ""}]${q.roleTitles[0] ? ` (${q.roleTitles[0]})` : ""} ${q.question}${prov}`;
};

export async function realQuestionsForInterview(company: string, stage: string, opts: { domain?: string; sampleTitles?: string[]; budgetMs?: number; harvest?: boolean } = {}): Promise<RealQuestions> {
  const name = (company || "").trim();
  if (!name) return { text: "", count: 0, stageCount: 0, harvest: "skipped" };
  let harvest: RealQuestions["harvest"] = "skipped";
  if (opts.harvest !== false) {
    const st = await webQuestionsStatus(name).catch(() => null);
    if (st?.fresh) harvest = "fresh";
    else if (!webQuestionsAvailable()) harvest = "unavailable";
    else if (st?.due) {
      // Bounded wait: the interview starts on time, the search keeps going and fills the bank for the next one.
      const done = await Promise.race([
        ensureWebQuestions(name, { domain: opts.domain, sampleTitles: opts.sampleTitles }).then(() => true),
        new Promise<false>((r) => setTimeout(() => r(false), opts.budgetMs ?? HARVEST_BUDGET_MS)),
      ]);
      harvest = done ? "ran" : "timeout";
    }
  }
  const bank = await questionBank(name, { limit: 200 }).catch(() => null);
  if (!bank || !bank.questions.length) return { text: "", count: 0, stageCount: 0, harvest };
  const wanted = new Set<string>(BANK_STAGES[stage] || ["other"]);
  const same = bank.questions.filter((q) => wanted.has(q.stage)).slice(0, SAME_STAGE_MAX);
  const other = bank.questions.filter((q) => !wanted.has(q.stage)).slice(0, OTHER_STAGE_MAX);
  const parts = [
    `REAL QUESTIONS asked at ${bank.company} (${bank.reported} reported by our own candidates after their interviews, ${bank.webCount} found in public interview reports; see /interview-questions):`,
    same.length ? `FOR THIS STAGE:\n${same.map(line).join("\n")}` : "FOR THIS STAGE: none reported yet.",
    other.length ? `FROM OTHER STAGES (use only if they fit):\n${other.map(line).join("\n")}` : "",
  ].filter(Boolean);
  return { text: parts.join("\n"), count: bank.total, stageCount: same.length, harvest };
}
