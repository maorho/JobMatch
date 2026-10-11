import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import { embedText } from "./embeddings";
import { buildCandidateText } from "./text";
import { rankJobs, rankForUser, type RankedJob } from "./hybrid";

export type MatchedJob = {
  _id: string;
  job: string;
  company: string;
  city?: string;
  country?: string;
  logoUrl?: string;
  companyDomain?: string;
  applyUrl?: string;
  postedAt?: Date;
  matchScore: number; // 0-100: reranker fit when available, else cosine heuristic adjusted for level
  cosine: number;
  why?: string;
  gaps?: string[];
  reranked?: boolean;
};

type MatchOptions = {
  limit?: number; // top N to return
  skip?: number; // for pagination
  minScore?: number; // filter by match score
};

/** Rank jobs by semantic similarity to a candidate embedding (Atlas vector search, level-agnostic). */
export async function matchByVector(candidateVec: number[], opts: MatchOptions = {}): Promise<MatchedJob[]> {
  if (!candidateVec || candidateVec.length === 0) return [];
  const { jobs } = await rankJobs({ vector: candidateVec, level: "mid", resumeSummary: "", resumeVersion: 0 }, { limit: opts.limit ?? 20, skip: opts.skip ?? 0, minScore: opts.minScore, rerank: false });
  return jobs.map(toMatched);
}

const toMatched = (r: RankedJob): MatchedJob => ({ _id: r._id, job: r.job, company: r.company, city: r.city, country: r.country, logoUrl: r.logoUrl, companyDomain: r.companyDomain, applyUrl: r.applyUrl, postedAt: r.postedAt, matchScore: r.matchScore, cosine: r.cosine, why: r.why, gaps: r.gaps, reranked: r.reranked });

/** Embed a free-text profile and match (ResumeAI flow, before a profile exists). */
export async function matchByText(
  candidateText: string,
  opts: MatchOptions = {}
): Promise<MatchedJob[]> {
  if (!candidateText || !candidateText.trim()) return [];
  const vec = await embedText(candidateText);
  return matchByVector(vec, opts);
}

/** Match jobs for a signed-in user: vector recall + level fit (+ LLM rerank on page 1 when `rerank`). */
export async function matchForUser(userId: string, opts: MatchOptions & { rerank?: boolean; query?: string } = {}): Promise<MatchedJob[]> {
  const { jobs } = await rankForUser(userId, { limit: opts.limit ?? 20, skip: opts.skip ?? 0, minScore: opts.minScore, rerank: opts.rerank ?? false, query: opts.query });
  return jobs.map(toMatched);
}

/** Build the candidate text from a user's profile, then match (legacy helper). */
export async function matchByUser(
  userId: string,
  extraResumeText?: string,
  opts: MatchOptions = {}
): Promise<{ candidateText: string; matches: MatchedJob[] }> {
  await connectToDatabase();
  const user = await User.findById(userId).select("currentJob company memory");
  if (!user) throw new Error("User not found");

  const candidateText = buildCandidateText(user as any, extraResumeText);
  const matches = await matchByText(candidateText, opts);
  return { candidateText, matches };
}
