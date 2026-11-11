import { seniorityOf } from "@/app/lib/jobTaxonomy";

/**
 * Seniority awareness for matching. Embeddings barely separate "Junior React
 * Developer" from "Senior React Developer"; the level is what decides whether
 * a candidate can realistically get the interview, so it gets its own signal.
 */
export type CandidateLevel = "junior" | "mid" | "senior";

const YEAR_RE = /(\d{1,2})\+?\s*(?:years?|yrs?|שנים|שנות)\b/gi;
const JUNIOR_RE = /\b(junior|entry[- ]level|graduate|intern(ship)?|student|bootcamp|trainee|recent graduate|new grad)\b|ג'וניור|סטודנט|בוגר|מתמחה|בוטקאמפ/i;
const SENIOR_RE = /\b(senior|lead|principal|staff|architect|head of|director|vp|cto|manager)\b|בכיר|ראש צוות|ארכיטקט/i;

/** Infer the candidate's level from the résumé text (plus the stated current job). */
export function inferCandidateLevel(resumeText: string, currentJob = ""): CandidateLevel {
  const text = `${currentJob}\n${resumeText || ""}`;
  const years = [...text.matchAll(YEAR_RE)].map((m) => parseInt(m[1], 10)).filter((n) => n > 0 && n < 40);
  const maxYears = years.length ? Math.max(...years) : 0;
  const juniorHits = (text.match(JUNIOR_RE) || []).length;
  const seniorHits = (text.match(SENIOR_RE) || []).length;
  if (maxYears >= 6 || (seniorHits >= 2 && maxYears >= 4)) return "senior";
  if (maxYears >= 3 && seniorHits >= 1) return "senior";
  if (maxYears >= 3) return "mid";
  if (juniorHits > 0 || maxYears <= 2) return "junior";
  return "mid";
}

/** The posting's level by the years it asks for: a "Software Engineer, 8+ years" is a senior role whatever the title says. */
export type YearsLevel = "Junior" | "Mid" | "Senior" | "Lead";
export function yearsLevel(experienceMin: number | null | undefined): YearsLevel | null {
  if (experienceMin == null || !Number.isFinite(experienceMin)) return null;
  if (experienceMin >= 8) return "Lead";
  if (experienceMin >= 5) return "Senior";
  if (experienceMin >= 3) return "Mid";
  return "Junior";
}

/** The candidate's band in years, the way the reranker prompt states it. */
export const CANDIDATE_YEARS: Record<CandidateLevel, string> = { junior: "0–2 years of experience", mid: "2–5 years of experience", senior: "5+ years of experience" };

const TITLE_FIT: Record<CandidateLevel, Record<string, number>> = {
  junior: { Intern: 0.9, Junior: 1, Mid: 0.55, Senior: 0.15 },
  mid: { Intern: 0.3, Junior: 0.7, Mid: 1, Senior: 0.6 },
  senior: { Intern: 0.1, Junior: 0.3, Mid: 0.8, Senior: 1 },
};
const YEARS_FIT: Record<CandidateLevel, Record<YearsLevel, number>> = {
  junior: { Junior: 1, Mid: 0.55, Senior: 0.15, Lead: 0.08 },
  mid: { Junior: 0.7, Mid: 1, Senior: 0.6, Lead: 0.35 },
  senior: { Junior: 0.3, Mid: 0.8, Senior: 1, Lead: 0.9 },
};

/**
 * 0–1 compatibility between the candidate's level and a posting's level: the
 * stricter of what the title says and what the stated years say. A junior
 * looking at "Full Stack Engineer · 8+ years" gets the senior-role penalty even
 * though the title carries no level word, and "Software Engineer · 0–2 years"
 * counts as a junior posting.
 */
export function levelFit(candidate: CandidateLevel, jobTitle: string, jobSeniority?: string[] | string, experienceMin?: number | null): number {
  const job = seniorityOf(jobTitle, jobSeniority); // Intern | Junior | Mid | Senior
  const byTitle = TITLE_FIT[candidate][job] ?? 0.6;
  const yl = yearsLevel(experienceMin);
  if (!yl || job === "Intern") return byTitle;
  // A title with no level word ("Software Engineer" → Mid by default) takes its level from the years;
  // a title that states one keeps the stricter of the two ("Senior … · 2+ years" is still senior).
  return job === "Mid" ? YEARS_FIT[candidate][yl] : Math.min(byTitle, YEARS_FIT[candidate][yl]);
}

/** Relevance (0–100) weighted by level fit: a senior role for a junior keeps about half its relevance; a fitting level keeps all of it. */
export const applyLevel = (base: number, fit: number): number => base * (0.5 + 0.5 * fit);

/**
 * The most a verdict may say when the posting's stated years are out of the
 * candidate's reach: two bands above (junior ↔ 5+ years, mid ↔ 8+ years) is not
 * realistic, one band above is a stretch at best. Null when the years do not bind.
 */
export function yearsCap(candidate: CandidateLevel, experienceMin: number | null | undefined): number | null {
  const yl = yearsLevel(experienceMin);
  if (!yl) return null;
  const rank: Record<YearsLevel, number> = { Junior: 0, Mid: 1, Senior: 2, Lead: 3 };
  const mine: Record<CandidateLevel, number> = { junior: 0, mid: 1, senior: 3 }; // a senior (5+ years) is not below an "8+ years" posting
  const gap = rank[yl] - mine[candidate];
  if (gap >= 2) return 30;
  if (gap === 1) return 65;
  return null;
}

/** Small freshness boost: new postings get a few points, month-old ones none. */
export function freshnessBoost(firstSeenAt?: Date | string | null): number {
  if (!firstSeenAt) return 0;
  const days = (Date.now() - new Date(firstSeenAt).getTime()) / 864e5;
  if (days <= 2) return 0.06;
  if (days <= 7) return 0.04;
  if (days <= 21) return 0.02;
  return 0;
}
