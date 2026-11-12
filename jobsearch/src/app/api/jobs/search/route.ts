import { parsePostedDays, postedSince, postedWithinFilter } from "@/app/lib/jobs/posted";
import { parseExperienceBuckets, experienceFilter, techFilter } from "@/app/lib/jobs/structured";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import Job from "@/app/models/Job";
import Company from "@/app/models/Company";
import ExternalJobs, { OPEN_JOBS } from "@/app/models/ExternalJobs";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { getCandidateVector } from "@/app/lib/matcher/candidateProfile";
import { textSearch, isAtlasSearchAvailable } from "@/app/lib/matcher/atlas";
import { applyLevel, levelFit } from "@/app/lib/matcher/level";
import User from "@/app/models/User";
import { cosineSimilarity, toMatchScore } from "@/app/lib/matcher/cosine";
import { memo, snippet, ttl, PUBLIC_CACHE, PRIVATE_CACHE } from "@/app/lib/cache";
import { groupVariants, type Variant } from "@/app/lib/jobs/variants";
import {
  INTERN_RE,
  JUNIOR_RE,
  SENIOR_RE,
  REMOTE_RE,
  HYBRID_RE,
} from "@/app/lib/jobTaxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Catalog-wide job search (internal + external) with pagination.
 *
 * GET /api/jobs/search?q=&company=&city=&country=&jobType=&seniority=&page=&limit=
 * Array params repeat (`company=A&company=B`) or are comma-separated.
 *
 * Internal postings (few) are returned in full on page 1; external postings
 * (the bulk) are paginated. Signed-in users with a résumé vector get a
 * `matchScore` on each external result and the page sorted by it.
 */

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function list(sp: URLSearchParams, key: string): string[] {
  return Array.from(
    new Set(
      sp
        .getAll(key)
        .flatMap((v) => v.split(","))
        .map((v) => v.trim())
        .filter(Boolean)
    )
  );
}

/** "matches RE in title or ATS seniority field" / its negation. */
const hit = (re: RegExp) => ({ $or: [{ job: re }, { seniority: re }] });
const miss = (re: RegExp) => ({
  $and: [{ job: { $not: re } }, { seniority: { $not: re } }],
});

/** Mongo filter for the selected seniority buckets — same precedence as seniorityOf(). */
function seniorityFilter(levels: string[]) {
  const byLevel: Record<string, object> = {
    Intern: hit(INTERN_RE),
    Junior: { $and: [hit(JUNIOR_RE), miss(INTERN_RE)] },
    Senior: { $and: [hit(SENIOR_RE), miss(INTERN_RE), miss(JUNIOR_RE)] },
    Mid: { $and: [miss(INTERN_RE), miss(JUNIOR_RE), miss(SENIOR_RE)] },
  };
  const parts = levels.map((l) => byLevel[l]).filter(Boolean);
  return parts.length ? { $or: parts } : {};
}

/**
 * Work mode for ATS postings — same inference as workModeOf(): location fields
 * only. Descriptions mention "remote" in boilerplate on most postings, so they
 * are deliberately NOT consulted.
 */
function externalWorkModeFilter(modes: string[]) {
  const text = (re: RegExp) => ({ $or: [{ city: re }, { country: re }] });
  const noText = (re: RegExp) => ({
    $and: [{ city: { $not: re } }, { country: { $not: re } }],
  });
  const notRemoteFlag = { remote: { $ne: true } };
  const byMode: Record<string, object> = {
    // The normalized `remote` flag (location agent) or legacy location text.
    Remote: { $or: [{ remote: true }, text(REMOTE_RE)] },
    Hybrid: { $and: [notRemoteFlag, noText(REMOTE_RE), text(HYBRID_RE)] },
    "On Site": { $and: [notRemoteFlag, noText(REMOTE_RE), noText(HYBRID_RE)] },
  };
  const parts = modes.map((m) => byMode[m]).filter(Boolean);
  return parts.length ? { $or: parts } : {};
}

const ANON_TTL_MS = ttl(60_000);
/** Totals are not personal: one count per filter combination serves everyone for a minute. */
const COUNT_TTL_MS = ttl(60_000);
/** Atlas recall depth; a query with fewer hits than this has an exact total without a second count. */
const RECALL = 600;

export async function GET(req: NextRequest) {
  // Anonymous pages are identical for everyone: serve them from the in-process cache (and let the CDN keep them a minute).
  const userId = await getUserIdFromRequest(req).catch(() => null);
  if (!userId) {
    const key = `search:${req.nextUrl.search}`;
    const body = await memo(key, ANON_TTL_MS, () => search(req, null));
    return NextResponse.json(body.payload, { status: body.status, headers: PUBLIC_CACHE });
  }
  const body = await search(req, userId);
  return NextResponse.json(body.payload, { status: body.status, headers: PRIVATE_CACHE });
}

async function search(req: NextRequest, userId: string | null): Promise<{ status: number; payload: unknown }> {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") || "").trim().slice(0, 100);
  const company = list(sp, "company");
  const city = list(sp, "city");
  const country = list(sp, "country");
  const jobType = list(sp, "jobType");
  const seniority = list(sp, "seniority");
  const postedDays = parsePostedDays(sp.get("posted"));
  const exp = parseExperienceBuckets(list(sp, "exp"));
  const tech = list(sp, "tech").slice(0, 10);
  const since = postedDays ? postedSince(postedDays) : null;
  const rawPage = parseInt(sp.get("page") || "1", 10);
  const rawLimit = parseInt(sp.get("limit") || "48", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 48;
  const skip = (page - 1) * limit;

  // A fixed list of postings (the ones a notification was about): exactly those, in that order, closed ones included.
  const ids = list(sp, "ids").filter((id) => mongoose.isValidObjectId(id)).slice(0, 50);

  try {
    await connectToDatabase();
    if (ids.length) {
      let vector: number[] | null = null;
      if (userId) vector = await getCandidateVector(userId).catch(() => null);
      const docs: any[] = await (vector ? ExternalJobs.find({ _id: { $in: ids } }).select("+embedding") : ExternalJobs.find({ _id: { $in: ids } })).lean();
      const pos = new Map(ids.map((id, i) => [id, i]));
      const jobs = docs
        .sort((a, b) => (pos.get(String(a._id)) ?? 0) - (pos.get(String(b._id)) ?? 0))
        .map((d) => {
          const { embedding, ...rest } = d;
          const matchScore = vector && Array.isArray(embedding) && embedding.length ? Math.round(toMatchScore(cosineSimilarity(vector, embedding))) : undefined;
          return { ...rest, description: snippet(rest.description), ...(matchScore !== undefined ? { matchScore } : {}), source: "external" };
        });
      return { status: 200, payload: { jobs, total: jobs.length, externalTotal: jobs.length, internalTotal: 0, page: 1, pages: 1, personalized: !!vector } };
    }
    // Multi-word queries match jobs containing EVERY word (anywhere in the
    // searchable fields), not the exact phrase — "junior developer" should
    // find a "Junior Full Stack Developer", not only that literal string.
    const words = q ? q.split(/\s+/).filter(Boolean).slice(0, 6) : [];
    const wordRes = words.map((w) => new RegExp(escapeRe(w), "i"));
    const re = q ? new RegExp(escapeRe(q), "i") : null; // whole phrase, for company lookups
    const textMatch = (fields: string[]) =>
      wordRes.length
        ? { $and: wordRes.map((r) => ({ $or: fields.map((f) => ({ [f]: r })) })) }
        : null;

    // ---------- external (ATS) postings: the bulk, paginated ----------
    // Closed postings never appear in search results or totals.
    const extAnd: object[] = [OPEN_JOBS];
    // Everything that shapes the external filter, for the shared count cache.
    const countKey = `search-count:${JSON.stringify({ q, company, city, country, jobType, seniority, posted: postedDays, exp, tech })}`;
    // Relevance-ranked recall from Atlas Search (BM25) when there is a query;
    // falls back to the every-word regex when Atlas Search isn't available.
    let rankedIds: string[] | null = null;
    if (q) {
      const hits = await textSearch(q, { limit: RECALL, filter: { company, city, country, ...(since ? { postedAfter: since } : {}) } }).catch(() => []);
      // Only trust the ranking when it came from Atlas Search; the regex fallback is just a prefilter.
      if (hits.length && isAtlasSearchAvailable()) rankedIds = hits.map((h) => h._id);
    }
    // With a ranked id list the ids already express the text match — the every-word regex (which
    // scans every description) is only needed as the fallback.
    const extText = rankedIds ? null : textMatch(["job", "description", "company", "city", "country"]);
    if (extText) extAnd.push(extText);
    if (company.length) extAnd.push({ company: { $in: company } });
    if (city.length) extAnd.push({ city: { $in: city } });
    if (country.length) extAnd.push({ country: { $in: country } });
    if (jobType.length) extAnd.push(externalWorkModeFilter(jobType));
    if (seniority.length) extAnd.push(seniorityFilter(seniority));
    if (since) extAnd.push(postedWithinFilter(since));
    if (exp.length) extAnd.push(experienceFilter(exp));
    if (tech.length) extAnd.push(techFilter(tech));
    const extFilter = { $and: extAnd };

    // ---------- internal postings: few, all returned on page 1 ----------
    let internalJobs: any[] = [];
    if (page === 1 && !exp.length && !tech.length) {
      const intAnd: object[] = [];
      const intText = textMatch(["job", "description", "city", "country"]);
      if (intText) intAnd.push(intText);
      if (company.length) {
        const ids = await Company.find({ companyName: { $in: company } })
          .select("_id")
          .lean();
        intAnd.push({ company: { $in: ids.map((c: any) => c._id) } });
      }
      if (city.length) intAnd.push({ city: { $in: city } });
      if (country.length) intAnd.push({ country: { $in: country } });
      if (jobType.length) intAnd.push({ type: { $in: jobType } });
      if (seniority.length) intAnd.push(seniorityFilter(seniority));
      if (since) intAnd.push({ createdAt: { $gte: since } });
      // The plain feed is "what is open now": a recruiter's posting older than 90 days stays reachable by company or query only.
      if (!q && !company.length) intAnd.push({ createdAt: { $gte: new Date(Date.now() - 90 * 86_400_000) } });
      internalJobs = await Job.find(intAnd.length ? { $and: intAnd } : {})
        .populate({ path: "company", model: "Company", select: "companyName" })
        .sort({ createdAt: -1 })
        .lean();
      // A company-name search should also hit internal postings by employer.
      if (re && !company.length) {
        const byName = await Company.find({ companyName: re }).select("_id").lean();
        if (byName.length) {
          const extra = await Job.find({
            company: { $in: byName.map((c: any) => c._id) },
            _id: { $nin: internalJobs.map((j) => j._id) },
            ...(since ? { createdAt: { $gte: since } } : {}),
          })
            .populate({ path: "company", model: "Company", select: "companyName" })
            .lean();
          internalJobs = [...internalJobs, ...extra];
        }
      }
    }

    // Personalisation: only pull embeddings when we can actually score.
    let vector: number[] | null = null;
    let level: "junior" | "mid" | "senior" = "mid";
    if (userId) {
      const [v, u]: [number[] | null, any] = await Promise.all([getCandidateVector(userId).catch(() => null), User.findById(userId).select("level").lean()]);
      vector = v;
      if (u?.level) level = u.level;
    }

    const rankPos = rankedIds ? new Map(rankedIds.map((id, i) => [id, i])) : null;
    let externalTotal = 0;
    let externalDocs: any[] = [];
    // The same role listed per location is one result with `variants` (lib/jobs/variants.ts): the
    // page and the total count roles, not listings. A city filter keeps only the matching locations.
    const variantsOf = new Map<string, Variant[]>();
    const loadPage = async (ids: string[]) => {
      const docs: any[] = await (vector ? ExternalJobs.find({ _id: { $in: ids } }).select("+embedding") : ExternalJobs.find({ _id: { $in: ids } })).lean();
      const pos = new Map(ids.map((id, i) => [id, i]));
      return docs.sort((a, b) => (pos.get(String(a._id)) ?? 0) - (pos.get(String(b._id)) ?? 0));
    };
    // The total always counts the whole catalog (every-word match); relevance
    // order covers the first 600 hits, deeper pages continue newest-first.
    if (rankPos) {
      // Relevance order: the page's ids first (cheap, light rows, honouring the other filters), then just those documents.
      const matching: any[] = await ExternalJobs.find({ ...extFilter, _id: { $in: rankedIds } }).select("company titleKey job city country remote").lean();
      const ordered = groupVariants(matching.sort((a, b) => (rankPos.get(String(a._id)) ?? 1e9) - (rankPos.get(String(b._id)) ?? 1e9)));
      for (const r of ordered) if (r.variants) variantsOf.set(String(r._id), r.variants);
      // Fewer hits than the recall depth → the hit list IS the whole result set; otherwise count the long way (shared, cached).
      externalTotal = rankedIds!.length < RECALL ? ordered.length : await memo(`${countKey}:text`, COUNT_TTL_MS, () => ExternalJobs.countDocuments({ $and: [...extAnd, textMatch(["job", "description", "company", "city", "country"])!] }));
      externalDocs = await loadPage(ordered.slice(skip, skip + limit).map((r) => String(r._id)));
    } else {
      // Newest first, one row per (company, titleKey): the group keeps its newest listing as the representative.
      const key = { company: { $toLower: "$company" }, titleKey: { $ifNull: ["$titleKey", { $toString: "$_id" }] } };
      const [groups, pageRows]: [any[], any[]] = await Promise.all([
        memo(countKey, COUNT_TTL_MS, async () => {
          const r: any[] = await ExternalJobs.aggregate([{ $match: extFilter }, { $group: { _id: key } }, { $count: "n" }]);
          return r[0]?.n || 0;
        }).then((n) => [n]),
        ExternalJobs.aggregate([
          { $match: extFilter },
          { $sort: { postedAt: -1, createdAt: -1, _id: -1 } },
          { $group: { _id: key, id: { $first: "$_id" }, postedAt: { $first: "$postedAt" }, createdAt: { $first: "$createdAt" }, variants: { $push: { _id: "$_id", city: "$city", country: "$country", remote: "$remote" } } } },
          { $sort: { postedAt: -1, createdAt: -1, id: -1 } },
          { $skip: skip },
          { $limit: limit },
        ]),
      ]);
      externalTotal = groups[0];
      for (const r of pageRows) if (r.variants.length > 1) variantsOf.set(String(r.id), r.variants.map((v: any) => ({ _id: String(v._id), ...(v.city ? { city: v.city } : {}), ...(v.country ? { country: v.country } : {}), ...(v.remote ? { remote: true } : {}) })));
      externalDocs = await loadPage(pageRows.map((r) => String(r.id)));
    }

    let external = externalDocs.map((d: any) => {
      const { embedding, ...rest } = d;
      const variants = variantsOf.get(String(d._id));
      const matchScore =
        vector && Array.isArray(embedding) && embedding.length
          ? Math.round(applyLevel(toMatchScore(cosineSimilarity(vector, embedding)), levelFit(level, d.job, d.seniority, d.experienceMin)))
          : undefined;
      return { ...rest, description: snippet(rest.description), ...(matchScore !== undefined ? { matchScore } : {}), ...(variants ? { variants } : {}), source: "external" };
    });
    if (vector && !rankPos) {
      external = external.sort(
        (a: any, b: any) => (b.matchScore ?? -1) - (a.matchScore ?? -1)
      );
    }

    const internal = internalJobs.map((j) => ({ ...j, description: snippet(j.description), source: "internal" }));
    const internalTotal = page === 1 ? internal.length : 0;

    return {
      status: 200,
      payload: {
        // One list in date order (an internal posting is not pinned above newer external ones); relevance order stays as is.
        jobs: rankPos || vector ? [...internal, ...external] : [...internal, ...external].sort((a: any, b: any) => new Date(b.postedAt || b.createdAt || 0).getTime() - new Date(a.postedAt || a.createdAt || 0).getTime()),
        total: externalTotal + internalTotal,
        externalTotal,
        internalTotal,
        page,
        pages: Math.max(1, Math.ceil(externalTotal / limit)),
        personalized: !!vector,
      },
    };
  } catch (err) {
    console.error("❌ job search error:", err);
    return { status: 500, payload: { message: "Search failed" } };
  }
}
