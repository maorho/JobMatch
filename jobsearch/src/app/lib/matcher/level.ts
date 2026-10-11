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

/** 0–1 compatibility between the candidate's level and a posting's level. */
export function levelFit(candidate: CandidateLevel, jobTitle: string, jobSeniority?: string[] | string): number {
  const job = seniorityOf(jobTitle, jobSeniority); // Intern | Junior | Mid | Senior
  const table: Record<CandidateLevel, Record<string, number>> = {
    junior: { Intern: 0.9, Junior: 1, Mid: 0.55, Senior: 0.15 },
    mid: { Intern: 0.3, Junior: 0.7, Mid: 1, Senior: 0.6 },
    senior: { Intern: 0.1, Junior: 0.3, Mid: 0.8, Senior: 1 },
  };
  return table[candidate][job] ?? 0.6;
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
