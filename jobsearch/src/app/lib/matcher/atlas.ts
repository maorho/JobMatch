import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs, { OPEN_JOBS } from "@/app/models/ExternalJobs";
import { cosineSimilarity } from "./cosine";

/**
 * Atlas Search access with graceful fallback. On Atlas the catalog is
 * queried through `$vectorSearch` (index `job_vectors`) and `$search`
 * (BM25, index `job_text`) — ~200ms over the whole catalog. Anywhere else
 * (tests on mongodb-memory-server, a plain Mongo) the same functions fall
 * back to in-process cosine / regex so behaviour stays identical, just slower.
 *
 * Index definitions (created once on the cluster; see scripts in memory):
 *   job_vectors: vector(embedding, 1536, cosine) + filters company/country/city/remote/firstSeenAt
 *   job_text:    string job/description/company/skills, token city/country
 *
 * Closed postings (active:false) are dropped by the callers (hybrid.ts loads
 * the hits through OPEN_JOBS). Once `active` is added as a filter field to
 * both indexes, set ATLAS_FILTER_ACTIVE=1 and the exclusion moves into the
 * Atlas query itself so closed jobs stop taking recall slots.
 */
export const VECTOR_INDEX = "job_vectors";
export const TEXT_INDEX = "job_text";

/** After Atlas Search fails, how long we serve the in-process fallback before trying Atlas again. */
export const ATLAS_RETRY_MS = 10 * 60_000;
/** Working set of the fallback: enough for a good page, small enough for a lambda's memory. */
export const FALLBACK_LIMIT = 1500;

// `ok` is what the last attempt said (null = never tried); `failedAt` lets the
// instance retry after ATLAS_RETRY_MS instead of latching to the fallback for life.
const state: { ok: boolean | null; failedAt: number; warned: boolean } = { ok: process.env.ATLAS_SEARCH === "0" ? false : null, failedAt: 0, warned: false };

/** True once Atlas Search has succeeded; false after it failed (or ATLAS_SEARCH=0); null before the first attempt. */
export function isAtlasSearchAvailable(): boolean | null {
  return state.ok;
}
export function _resetAtlasFlag() {
  state.ok = process.env.ATLAS_SEARCH === "0" ? false : null;
  state.failedAt = 0;
  state.warned = false;
}

const shouldTryAtlas = () => state.ok !== false || (process.env.ATLAS_SEARCH !== "0" && Date.now() - state.failedAt > ATLAS_RETRY_MS);

// Only the errors that mean "this server has no Atlas Search" switch us to the
// fallback; anything else (timeouts, bad filters, auth) propagates.
// (mongodb-memory-server says "$vectorSearch stage is only allowed on MongoDB Atlas".)
const notSupported = (e: any) => /only allowed on MongoDB Atlas|Unrecognized pipeline stage name|index .*(not found|does not exist)|not allowed|not supported|CommandNotSupported|Atlas Search (is )?not (enabled|available)/i.test(String(e?.message || e));

function markFailed(e: unknown) {
  state.ok = false;
  state.failedAt = Date.now();
  if (!state.warned) {
    state.warned = true;
    console.warn(`[atlas] Atlas Search unavailable, ranking in-process over the newest ${FALLBACK_LIMIT} embedded postings (retry in ${ATLAS_RETRY_MS / 60_000} min):`, (e as Error)?.message || e);
  }
}

export type VectorHit = { _id: string; score: number };
export type VectorFilter = { company?: string[]; country?: string[]; city?: string[]; remote?: boolean; firstSeenAfter?: Date };

function atlasFilter(f?: VectorFilter): Record<string, unknown> | undefined {
  const and: Record<string, unknown>[] = [];
  if (f?.company?.length) and.push({ company: { $in: f.company } });
  if (f?.country?.length) and.push({ country: { $in: f.country } });
  if (f?.city?.length) and.push({ city: { $in: f.city } });
  if (f?.remote !== undefined) and.push({ remote: f.remote });
  if (f?.firstSeenAfter) and.push({ firstSeenAt: { $gt: f.firstSeenAfter } });
  if (process.env.ATLAS_FILTER_ACTIVE === "1") and.push({ active: { $ne: false } });
  return and.length ? { $and: and } : undefined;
}

function mongoFilter(f?: VectorFilter): Record<string, unknown> {
  const q: Record<string, unknown> = { ...OPEN_JOBS, embedding: { $exists: true } };
  if (f?.company?.length) q.company = { $in: f.company };
  if (f?.country?.length) q.country = { $in: f.country };
  if (f?.city?.length) q.city = { $in: f.city };
  if (f?.remote !== undefined) q.remote = f.remote;
  if (f?.firstSeenAfter) q.firstSeenAt = { $gt: f.firstSeenAfter };
  return q;
}

/** Nearest postings to a vector: `score` is cosine similarity (0–1). */
export async function vectorSearch(vec: number[], opts: { limit?: number; numCandidates?: number; filter?: VectorFilter } = {}): Promise<VectorHit[]> {
  await connectToDatabase();
  const limit = opts.limit ?? 50;
  if (shouldTryAtlas()) {
    try {
      const stage: Record<string, unknown> = { index: VECTOR_INDEX, path: "embedding", queryVector: vec, numCandidates: opts.numCandidates ?? Math.max(limit * 8, 200), limit };
      const filter = atlasFilter(opts.filter);
      if (filter) stage.filter = filter;
      const rows: any[] = await ExternalJobs.aggregate([{ $vectorSearch: stage } as any, { $project: { _id: 1, score: { $meta: "vectorSearchScore" } } }]);
      state.ok = true;
      return rows.map((r) => ({ _id: String(r._id), score: Number(r.score) }));
    } catch (e) {
      if (!notSupported(e)) throw e;
      markFailed(e);
    }
  }
  // Fallback: in-process cosine over the newest open embedded postings (bounded).
  const docs: any[] = await ExternalJobs.find(mongoFilter(opts.filter)).select("+embedding").sort({ postedAt: -1 }).limit(FALLBACK_LIMIT).lean();
  return docs
    .filter((d) => Array.isArray(d.embedding) && d.embedding.length === vec.length)
    .map((d) => ({ _id: String(d._id), score: cosineSimilarity(vec, d.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export type TextHit = { _id: string; score: number };

/** BM25 over title/description/company/skills: ids ranked by relevance. */
export async function textSearch(query: string, opts: { limit?: number; filter?: VectorFilter } = {}): Promise<TextHit[]> {
  await connectToDatabase();
  const limit = opts.limit ?? 200;
  const q = query.trim();
  if (!q) return [];
  if (shouldTryAtlas()) {
    try {
      const must: Record<string, unknown>[] = [];
      const f = opts.filter;
      if (f?.company?.length) must.push({ text: { query: f.company, path: "company" } });
      if (f?.country?.length) must.push({ in: { value: f.country, path: "country" } });
      if (f?.city?.length) must.push({ in: { value: f.city, path: "city" } });
      // Needs `active` indexed as a boolean in job_text (see the header).
      if (process.env.ATLAS_FILTER_ACTIVE === "1") must.push({ equals: { value: true, path: "active" } });
      const compound: Record<string, unknown> = {
        should: [
          { text: { query: q, path: "job", score: { boost: { value: 3 } } } },
          { text: { query: q, path: ["description", "skills", "company"] } },
        ],
        minimumShouldMatch: 1,
        ...(must.length ? { filter: must } : {}),
      };
      const rows: any[] = await ExternalJobs.aggregate([{ $search: { index: TEXT_INDEX, compound } }, { $limit: limit }, { $project: { _id: 1, score: { $meta: "searchScore" } } }]);
      state.ok = true;
      return rows.map((r) => ({ _id: String(r._id), score: Number(r.score) }));
    } catch (e) {
      if (!notSupported(e)) throw e;
      markFailed(e);
    }
  }
  // Fallback: every word must appear somewhere (same rule the search route used).
  const words = q.split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = words.map((w) => ({ $or: ["job", "description", "company", "skills"].map((f) => ({ [f]: new RegExp(w, "i") })) }));
  const docs: any[] = await ExternalJobs.find({ $and: re, ...mongoFilter(opts.filter) }).select("_id job").limit(limit).lean();
  return docs.map((d, i) => ({ _id: String(d._id), score: (/junior/i.test(q) && /junior/i.test(d.job) ? 2 : 1) * (1 / (1 + i)) }));
}
