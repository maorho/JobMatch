import { cosineSimilarity, toMatchScore } from "./cosine";
import { applyLevel, freshnessBoost, levelFit, type CandidateLevel } from "./level";

/**
 * The ONE heuristic match score, used by every place that shows a number
 * before (or without) the reranker's verdict: the personalised feed, the
 * signed-in catalogue search and the job page. Semantic similarity, weighted
 * by level fit (title and stated years), plus the freshness boost — so the
 * same résumé and the same posting give the same number everywhere. A
 * cached reranker verdict (MatchCache) overrides it in all three places;
 * `reranked` on the row says which one the person is looking at.
 */
export type ScoredPosting = { embedding?: number[] | null; job: string; seniority?: string[] | string; experienceMin?: number | null; firstSeenAt?: Date | string | null; originalFirstSeenAt?: Date | string | null };

export function heuristicScore(profile: { vector: number[] | null; level: CandidateLevel }, job: ScoredPosting): number | null {
  if (!profile.vector || !Array.isArray(job.embedding) || !job.embedding.length) return null;
  const base = toMatchScore(cosineSimilarity(profile.vector, job.embedding));
  const lf = levelFit(profile.level, job.job, job.seniority, job.experienceMin);
  return Math.max(0, Math.min(100, Math.round(applyLevel(base, lf) + freshnessBoost(job.originalFirstSeenAt || job.firstSeenAt) * 100)));
}
