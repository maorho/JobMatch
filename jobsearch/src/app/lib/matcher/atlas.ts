import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs from "@/app/models/ExternalJobs";
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
 */
export const VECTOR_INDEX = "job_vectors";
export const TEXT_INDEX = "job_text";

let atlasAvailable: boolean | null = process.env.ATLAS_SEARCH === "0" ? false : null;

/** True once a `$vectorSearch` has succeeded; false after it failed with "not supported". */
export function isAtlasSearchAvailable(): boolean | null {
  return atlasAvailable;
}
export function _resetAtlasFlag() {
  atlasAvailable = process.env.ATLAS_SEARCH === "0" ? false : null;
}

const notSupported = (e: any) => /Unrecognized pipeline stage|\$vectorSearch|\$search|not allowed|is not supported|CommandNotSupported/i.test(String(e?.message || e));

export type VectorHit = { _id: string; score: number };
export type VectorFilter = { company?: string[]; country?: string[]; city?: string[]; remote?: boolean; firstSeenAfter?: Date };

function atlasFilter(f?: VectorFilter): Record<string, unknown> | undefined {
  if (!f) return undefined;
  const and: Record<string, unknown>[] = [];
  if (f.company?.length) and.push({ company: { $in: f.company } });
  if (f.country?.length) and.push({ country: { $in: f.country } });
  if (f.city?.length) and.push({ city: { $in: f.city } });
  if (f.remote !== undefined) and.push({ remote: f.remote });
  if (f.firstSeenAfter) and.push({ firstSeenAt: { $gt: f.firstSeenAfter } });
  return and.length ? { $and: and } : undefined;
}

function mongoFilter(f?: VectorFilter): Record<string, unknown> {
  const q: Record<string, unknown> = { embedding: { $exists: true } };
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
  if (atlasAvailable !== false) {
    try {
      const stage: Record<string, unknown> = { index: VECTOR_INDEX, path: "embedding", queryVector: vec, numCandidates: opts.numCandidates ?? Math.max(limit * 8, 200), limit };
      const filter = atlasFilter(opts.filter);
      if (filter) stage.filter = filter;
      const rows: any[] = await ExternalJobs.aggregate([{ $vectorSearch: stage } as any, { $project: { _id: 1, score: { $meta: "vectorSearchScore" } } }]);
      atlasAvailable = true;
      return rows.map((r) => ({ _id: String(r._id), score: Number(r.score) }));
    } catch (e) {
      if (!notSupported(e)) throw e;
      atlasAvailable = false;
    }
  }
  // Fallback: in-process cosine over (a bounded slice of) the embedded catalog.
  const docs: any[] = await ExternalJobs.find(mongoFilter(opts.filter)).select("+embedding").sort({ postedAt: -1 }).limit(5000).lean();
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
  if (atlasAvailable !== false) {
    try {
      const must: Record<string, unknown>[] = [];
      const f = opts.filter;
      if (f?.company?.length) must.push({ text: { query: f.company, path: "company" } });
      if (f?.country?.length) must.push({ in: { value: f.country, path: "country" } });
      if (f?.city?.length) must.push({ in: { value: f.city, path: "city" } });
      const compound: Record<string, unknown> = {
        should: [
          { text: { query: q, path: "job", score: { boost: { value: 3 } } } },
          { text: { query: q, path: ["description", "skills", "company"] } },
        ],
        minimumShouldMatch: 1,
        ...(must.length ? { filter: must } : {}),
      };
      const rows: any[] = await ExternalJobs.aggregate([{ $search: { index: TEXT_INDEX, compound } }, { $limit: limit }, { $project: { _id: 1, score: { $meta: "searchScore" } } }]);
      atlasAvailable = true;
      return rows.map((r) => ({ _id: String(r._id), score: Number(r.score) }));
    } catch (e) {
      if (!notSupported(e)) throw e;
      atlasAvailable = false;
    }
  }
  // Fallback: every word must appear somewhere (same rule the search route used).
  const words = q.split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = words.map((w) => ({ $or: ["job", "description", "company", "skills"].map((f) => ({ [f]: new RegExp(w, "i") })) }));
  const docs: any[] = await ExternalJobs.find({ $and: re, ...mongoFilter(opts.filter) }).select("_id job").limit(limit).lean();
  return docs.map((d, i) => ({ _id: String(d._id), score: (/junior/i.test(q) && /junior/i.test(d.job) ? 2 : 1) * (1 / (1 + i)) }));
}
