import { connectToDatabase } from "@/app/lib/db";
import InterviewSession from "@/app/models/InterviewSession";
import ApplicationOutcome from "@/app/models/ApplicationOutcome";
import { companyKey } from "@/app/lib/outcomes/companyKey";

/**
 * Two things the debrief says beyond the interviewer's own opinion:
 *
 * 1. PEERS — how this score sits among other candidates who simulated an
 *    interview at the same company (anonymous aggregates only, never names).
 * 2. CALIBRATION — whether the simulator's scores have predicted real
 *    outcomes so far: the median mock score of people who later reached an
 *    interview at that company (or anywhere, when the company has too few),
 *    against those who were rejected. Shown only once there is enough data.
 */
export type PeerComparison = {
  company: string;
  stage: string;
  /** Other candidates, same company, same stage. */
  sameStage: { n: number; median: number | null; percentile: number | null };
  /** Other candidates, same company, any stage. */
  anyStage: { n: number; median: number | null; percentile: number | null };
  /** This person's previous interviews at the same company (any stage). */
  ownPrevious: number;
};

export type Calibration = {
  scope: "company" | "global";
  company: string;
  /** Finished mock interviews whose user later reported an outcome for that company. */
  samples: number;
  medianReachedInterview: number | null;
  medianRejected: number | null;
  reachedInterview: number;
  rejected: number;
};

export const PEER_MIN = 3;
export const CALIBRATION_MIN = 12;

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

/** Share of the others this score beats (0–100), ties count half. */
export const percentileOf = (score: number, others: number[]): number | null => {
  if (!others.length) return null;
  const below = others.filter((x) => x < score).length;
  const same = others.filter((x) => x === score).length;
  return Math.round(((below + same / 2) / others.length) * 100);
};

/** One candidate counts once per (company, stage): their best score, so repeat practice doesn't flood the pool. */
function bestPerUser(rows: { userId: string; score: number }[]): number[] {
  const best = new Map<string, number>();
  for (const r of rows) best.set(r.userId, Math.max(best.get(r.userId) ?? -1, r.score));
  return [...best.values()];
}

export async function peerComparison(input: { userId: string; company: string; stage: string; score: number }): Promise<PeerComparison> {
  await connectToDatabase();
  const rows: any[] = await InterviewSession.find({ company: input.company, status: "finished", "feedback.overallScore": { $exists: true } })
    .select("userId stage feedback.overallScore")
    .limit(2000)
    .lean();
  const others = rows.filter((r) => String(r.userId) !== input.userId).map((r) => ({ userId: String(r.userId), stage: r.stage, score: Number(r.feedback.overallScore) }));
  const same = bestPerUser(others.filter((r) => r.stage === input.stage));
  const any = bestPerUser(others);
  const pack = (xs: number[]) => (xs.length >= PEER_MIN ? { n: xs.length, median: median(xs), percentile: percentileOf(input.score, xs) } : { n: xs.length, median: null, percentile: null });
  return {
    company: input.company,
    stage: input.stage,
    sameStage: pack(same),
    anyStage: pack(any),
    ownPrevious: rows.filter((r) => String(r.userId) === input.userId).length - 1,
  };
}

/**
 * Mock scores vs. what happened for real: for every finished mock interview,
 * the best outcome its user reported for the same company afterwards.
 */
export async function calibration(company: string): Promise<Calibration | null> {
  await connectToDatabase();
  const compute = async (filter: Record<string, unknown>, scope: "company" | "global"): Promise<Calibration | null> => {
    const sessions: any[] = await InterviewSession.find({ ...filter, status: "finished", "feedback.overallScore": { $exists: true } }).select("userId company feedback.overallScore createdAt").limit(3000).lean();
    if (!sessions.length) return null;
    const userIds = [...new Set(sessions.map((s) => String(s.userId)))];
    const outcomes: any[] = await ApplicationOutcome.find({ userId: { $in: userIds }, outcome: { $in: ["rejected", "screen", "interview", "offer"] } }).select("userId companyKey outcome reached resolvedAt respondedAt").lean();
    const byUser = new Map<string, any[]>();
    for (const o of outcomes) byUser.set(String(o.userId), [...(byUser.get(String(o.userId)) || []), o]);
    const reached: number[] = [];
    const rejected: number[] = [];
    for (const s of sessions) {
      const key = companyKey(s.company || "");
      const mine = (byUser.get(String(s.userId)) || []).filter((o) => !key || o.companyKey === key);
      if (!mine.length) continue;
      const good = mine.some((o) => o.outcome === "interview" || o.outcome === "offer" || o.reached === "interview" || o.reached === "offer");
      (good ? reached : rejected).push(Number(s.feedback.overallScore));
    }
    const samples = reached.length + rejected.length;
    if (samples < CALIBRATION_MIN) return null;
    return { scope, company, samples, medianReachedInterview: median(reached), medianRejected: median(rejected), reachedInterview: reached.length, rejected: rejected.length };
  };
  return (await compute({ company }, "company")) || (await compute({}, "global"));
}

/** A sentence for the debrief prompt, so the written verdict is consistent with what the numbers say. */
export function calibrationNote(c: Calibration | null): string {
  if (!c) return "";
  const where = c.scope === "company" ? `at ${c.company}` : "across all companies";
  return `CALIBRATION (${c.samples} earlier mock interviews ${where} whose candidates later reported a real outcome): candidates who reached a real interview had a median mock score of ${c.medianReachedInterview ?? "n/a"}; candidates who were rejected, ${c.medianRejected ?? "n/a"}. Keep your 0–100 score on that scale.`;
}
