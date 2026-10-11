import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs from "@/app/models/ExternalJobs";
import User from "@/app/models/User";
import { vectorSearch, textSearch, type VectorFilter } from "./atlas";
import { toMatchScore } from "./cosine";
import { inferCandidateLevel, levelFit, freshnessBoost, type CandidateLevel } from "./level";
import { rerankForUser } from "./rerank";
import { loadModel, likelihoodFrom, type Likelihood } from "./likelihood";
import { seniorityOf } from "@/app/lib/jobTaxonomy";
import { getCandidateVector } from "./candidateProfile";
import { structuredToText, isStructuredResume } from "@/app/lib/resume/structuredToText";

/**
 * The matching pipeline:
 *   1. recall  — Atlas vector search (and BM25 when there is a query), fused with RRF
 *   2. signals — level fit (junior vs senior), freshness
 *   3. rerank  — LLM verdict on the top of the list (fit 0–100, why, gaps), cached
 * `matchScore` is what the product shows: the reranker's fit when it exists,
 * otherwise the cosine-based heuristic adjusted by the level signal.
 */
export type RankedJob = {
  _id: string;
  job: string;
  company: string;
  city?: string;
  country?: string;
  remote?: boolean;
  logoUrl?: string;
  companyDomain?: string;
  applyUrl?: string;
  postedAt?: Date;
  firstSeenAt?: Date;
  matchScore: number;
  cosine: number;
  levelFit: number;
  why?: string;
  gaps?: string[];
  reranked: boolean;
  /** JobMatch's own "interview likelihood" (lib/matcher/likelihood.ts), 0–100. */
  likelihood?: Likelihood;
};

export type RankOptions = {
  query?: string;
  filter?: VectorFilter;
  limit?: number;
  skip?: number;
  minScore?: number;
  /** Run the LLM reranker on the top `rerankTop` (default: when the user has a résumé and page 1). */
  rerank?: boolean;
  rerankTop?: number;
  language?: "he" | "en";
};

const RRF_K = 60;

/** Reciprocal-rank fusion of several ranked id lists. */
export function rrf(lists: { _id: string }[][], weights?: number[]): Map<string, number> {
  const out = new Map<string, number>();
  lists.forEach((list, li) => {
    const w = weights?.[li] ?? 1;
    list.forEach((item, rank) => out.set(item._id, (out.get(item._id) || 0) + w / (RRF_K + rank + 1)));
  });
  return out;
}

export type CandidateProfile = { userId?: string; vector: number[] | null; level: CandidateLevel; resumeSummary: string; resumeVersion: number };

export async function loadCandidateProfile(userId: string, opts: { light?: boolean } = {}): Promise<CandidateProfile | null> {
  await connectToDatabase();
  // `light` skips the résumé text (only needed for the reranker) — the vector + level are enough to rank.
  const [vector, user]: [number[] | null, any] = await Promise.all([getCandidateVector(userId), User.findById(userId).select(opts.light ? "currentJob resumeUpdatedAt level" : "+resumeText +resumeStructured currentJob resumeUpdatedAt level").lean()]);
  if (!user) return null;
  const resumeText = opts.light ? (user.level ? "x" : "") : (user.resumeText || "").trim() || (isStructuredResume(user.resumeStructured) ? structuredToText(user.resumeStructured) : "");
  const level: CandidateLevel = user.level || inferCandidateLevel(resumeText, user.currentJob || "");
  return { userId, vector, level, resumeSummary: resumeText.slice(0, 4000), resumeVersion: user.resumeUpdatedAt ? new Date(user.resumeUpdatedAt).getTime() : 0 };
}

/** Rank the catalog for a profile (vector + optional query), with level/freshness signals and optional LLM rerank. */
export async function rankJobs(profile: CandidateProfile, opts: RankOptions = {}): Promise<{ jobs: RankedJob[]; total: number }> {
  await connectToDatabase();
  const limit = opts.limit ?? 48;
  const skip = opts.skip ?? 0;
  const pool = Math.min(Math.max((skip + limit) * 3, 150), 600);
  const [vec, txt] = await Promise.all([
    profile.vector ? vectorSearch(profile.vector, { limit: pool, filter: opts.filter }) : Promise.resolve([]),
    opts.query ? textSearch(opts.query, { limit: pool, filter: opts.filter }) : Promise.resolve([]),
  ]);
  if (!vec.length && !txt.length) return { jobs: [], total: 0 };
  // Recall pool = union of both lists; relevance = blend of normalized scores
  // (RRF ranks are too flat to combine with the level/freshness signals).
  const cosineOf = new Map(vec.map((v) => [v._id, v.score]));
  const maxText = txt.reduce((m, t) => Math.max(m, t.score), 0) || 1;
  const textOf = new Map(txt.map((t) => [t._id, t.score / maxText]));
  const ids = [...new Set([...vec.map((v) => v._id), ...txt.map((t) => t._id)])];

  // Light projection for the whole pool (descriptions are ~10KB each; only the rerank head needs them).
  const docs: any[] = await ExternalJobs.find({ _id: { $in: ids } }).select("job company city country remote logoUrl companyDomain applyUrl finalUrl url postedAt firstSeenAt seniority").lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));

  let ranked: RankedJob[] = ids
    .map((id) => {
      const d = byId.get(id);
      if (!d) return null;
      const cosine = cosineOf.get(id);
      const textual = textOf.get(id);
      const lf = levelFit(profile.level, d.job, d.seniority);
      // Base relevance 0–100: semantic similarity (and lexical relevance when there is a query).
      const semantic = cosine !== undefined ? toMatchScore(cosine) : undefined;
      const lexical = textual !== undefined ? 50 + 50 * textual : undefined;
      const base = semantic !== undefined && lexical !== undefined ? 0.6 * semantic + 0.4 * lexical : semantic ?? lexical ?? 0;
      // Level is decisive: a senior role for a junior loses up to ~45 points; freshness adds a few.
      const matchScore = Math.max(0, Math.min(100, Math.round(base * (0.55 + 0.45 * lf) + freshnessBoost(d.firstSeenAt) * 100)));
      return { _id: id, job: d.job, company: d.company, city: d.city, country: d.country, remote: d.remote, logoUrl: d.logoUrl, companyDomain: d.companyDomain, applyUrl: d.applyUrl || d.finalUrl || d.url, postedAt: d.postedAt, firstSeenAt: d.firstSeenAt, matchScore, cosine: cosine ?? 0, levelFit: lf, reranked: false, _seniority: d.seniority } as RankedJob & { _seniority: any };
    })
    .filter(Boolean) as (RankedJob & { _seniority: any })[];
  ranked.sort((a, b) => b.matchScore - a.matchScore || b.cosine - a.cosine);

  // Rerank the head of the list with the LLM (cached per résumé version).
  const wantRerank = opts.rerank ?? (!!profile.userId && !!profile.resumeSummary && skip === 0);
  if (wantRerank && profile.userId && profile.resumeSummary) {
    const top = ranked.slice(0, opts.rerankTop ?? 24) as any[];
    const descs: any[] = await ExternalJobs.find({ _id: { $in: top.map((t) => t._id) } }).select("description").lean();
    const descOf = new Map(descs.map((d) => [String(d._id), d.description || ""]));
    for (const t of top) t._description = descOf.get(t._id) || "";
    const verdicts = await rerankForUser({
      userId: profile.userId,
      resumeVersion: profile.resumeVersion,
      resumeSummary: profile.resumeSummary,
      level: profile.level,
      language: opts.language,
      jobs: top.map((t) => ({ _id: t._id, job: t.job, company: t.company, description: t._description || "", city: t.city, country: t.country, seniority: t._seniority })),
    });
    for (const t of top) {
      const v = verdicts.get(t._id);
      if (!v) continue;
      t.matchScore = v.fit;
      t.why = v.why;
      t.gaps = v.gaps;
      t.reranked = true;
    }
    // Reranked items sort by fit among themselves and stay ahead of the unreranked tail.
    const head = top.sort((a, b) => b.matchScore - a.matchScore);
    ranked = [...head, ...ranked.slice(head.length)];
  }

  const minScore = opts.minScore ?? 0;
  const final = ranked.filter((r) => r.matchScore >= minScore).map(({ _description: _d, _seniority: _s, ...r }: any) => r as RankedJob);
  const page = final.slice(skip, skip + limit);
  // The shown number: interview likelihood from the same features the outcome loop stores.
  const model = await loadModel().catch(() => null);
  const seniorityOfJob = new Map((ranked as any[]).map((r) => [r._id, r._seniority]));
  for (const j of page) {
    j.likelihood = likelihoodFrom(model, {
      matchScore: j.matchScore,
      cosine: j.cosine,
      levelFit: j.levelFit,
      rerankFit: j.reranked ? j.matchScore : null,
      level: profile.level,
      jobSeniority: String(seniorityOf(j.job, seniorityOfJob.get(j._id)) || "").toLowerCase(),
      remote: !!j.remote,
      postedAgeDays: j.firstSeenAt || j.postedAt ? Math.max(0, Math.round((Date.now() - new Date((j.firstSeenAt || j.postedAt) as Date).getTime()) / 86_400_000)) : null,
    });
  }
  return { jobs: page, total: final.length };
}

/** Convenience: rank for a signed-in user. */
export async function rankForUser(userId: string, opts: RankOptions = {}): Promise<{ jobs: RankedJob[]; total: number; profile: CandidateProfile | null }> {
  const wantRerank = opts.rerank ?? (opts.skip ?? 0) === 0;
  const profile = await loadCandidateProfile(userId, { light: !wantRerank });
  if (!profile || (!profile.vector && !opts.query)) return { jobs: [], total: 0, profile };
  const r = await rankJobs(profile, opts);
  return { ...r, profile };
}
