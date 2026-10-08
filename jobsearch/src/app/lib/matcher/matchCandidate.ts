import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs from "@/app/models/ExternalJobs";
import User from "@/app/models/User";
import { embedText } from "./embeddings";
import { cosineSimilarity, toMatchScore } from "./cosine";
import { buildCandidateText } from "./text";
import { getCandidateVector } from "./candidateProfile";

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
  matchScore: number; // 0-100 (heuristic)
  cosine: number;
};

type MatchOptions = {
  limit?: number; // top N to return
  skip?: number; // for pagination
  minScore?: number; // filter by match score
};

// In-app cosine scales fine into the low thousands; cap the working set so a
// single request can't blow up memory. Migrate to Atlas Vector Search before
// this cap starts dropping relevant jobs.
const MAX_JOBS = 5000;

/** Rank jobs by semantic similarity to a candidate embedding. */
export async function matchByVector(
  candidateVec: number[],
  opts: MatchOptions = {}
): Promise<MatchedJob[]> {
  await connectToDatabase();

  const limit = opts.limit ?? 20;
  const skip = opts.skip ?? 0;
  const minScore = opts.minScore ?? 0;

  if (!candidateVec || candidateVec.length === 0) return [];

  const jobs = await ExternalJobs.find({ embedding: { $exists: true } })
    .select(
      "+embedding job company city country logoUrl companyDomain applyUrl postedAt"
    )
    .sort({ postedAt: -1 })
    .limit(MAX_JOBS)
    .lean();

  const scored: MatchedJob[] = [];
  for (const j of jobs as any[]) {
    if (!Array.isArray(j.embedding)) continue;
    const cosine = cosineSimilarity(candidateVec, j.embedding);
    const matchScore = toMatchScore(cosine);
    if (matchScore < minScore) continue;
    scored.push({
      _id: String(j._id),
      job: j.job,
      company: j.company,
      city: j.city,
      country: j.country,
      logoUrl: j.logoUrl,
      companyDomain: j.companyDomain,
      applyUrl: j.applyUrl,
      postedAt: j.postedAt,
      matchScore,
      cosine,
    });
  }

  scored.sort((a, b) => b.cosine - a.cosine);
  return scored.slice(skip, skip + limit);
}

/** Embed a free-text profile and match (ResumeAI flow, before a profile exists). */
export async function matchByText(
  candidateText: string,
  opts: MatchOptions = {}
): Promise<MatchedJob[]> {
  if (!candidateText || !candidateText.trim()) return [];
  const vec = await embedText(candidateText);
  return matchByVector(vec, opts);
}

/** Match jobs for a signed-in user using their stored (or freshly built) vector. */
export async function matchForUser(
  userId: string,
  opts: MatchOptions = {}
): Promise<MatchedJob[]> {
  const vec = await getCandidateVector(userId);
  if (!vec) return [];
  return matchByVector(vec, opts);
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
