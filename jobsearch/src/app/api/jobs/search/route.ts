import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import Job from "@/app/models/Job";
import Company from "@/app/models/Company";
import ExternalJobs from "@/app/models/ExternalJobs";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { getCandidateVector } from "@/app/lib/matcher/candidateProfile";
import { cosineSimilarity, toMatchScore } from "@/app/lib/matcher/cosine";
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
  const byMode: Record<string, object> = {
    Remote: text(REMOTE_RE),
    Hybrid: { $and: [noText(REMOTE_RE), text(HYBRID_RE)] },
    "On Site": { $and: [noText(REMOTE_RE), noText(HYBRID_RE)] },
  };
  const parts = modes.map((m) => byMode[m]).filter(Boolean);
  return parts.length ? { $or: parts } : {};
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") || "").trim().slice(0, 100);
  const company = list(sp, "company");
  const city = list(sp, "city");
  const country = list(sp, "country");
  const jobType = list(sp, "jobType");
  const seniority = list(sp, "seniority");
  const rawPage = parseInt(sp.get("page") || "1", 10);
  const rawLimit = parseInt(sp.get("limit") || "48", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 48;
  const skip = (page - 1) * limit;

  try {
    await connectToDatabase();
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
    const extAnd: object[] = [];
    const extText = textMatch(["job", "description", "company", "city", "country"]);
    if (extText) extAnd.push(extText);
    if (company.length) extAnd.push({ company: { $in: company } });
    if (city.length) extAnd.push({ city: { $in: city } });
    if (country.length) extAnd.push({ country: { $in: country } });
    if (jobType.length) extAnd.push(externalWorkModeFilter(jobType));
    if (seniority.length) extAnd.push(seniorityFilter(seniority));
    const extFilter = extAnd.length ? { $and: extAnd } : {};

    // ---------- internal postings: few, all returned on page 1 ----------
    let internalJobs: any[] = [];
    if (page === 1) {
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
          })
            .populate({ path: "company", model: "Company", select: "companyName" })
            .lean();
          internalJobs = [...internalJobs, ...extra];
        }
      }
    }

    // Personalisation: only pull embeddings when we can actually score.
    const userId = await getUserIdFromRequest(req).catch(() => null);
    let vector: number[] | null = null;
    if (userId) {
      vector = await getCandidateVector(userId).catch(() => null);
    }

    let pageQuery = ExternalJobs.find(extFilter);
    if (vector) pageQuery = pageQuery.select("+embedding");
    const [externalTotal, externalDocs] = await Promise.all([
      ExternalJobs.countDocuments(extFilter),
      pageQuery.sort({ postedAt: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    let external = externalDocs.map((d: any) => {
      const { embedding, ...rest } = d;
      const matchScore =
        vector && Array.isArray(embedding) && embedding.length
          ? toMatchScore(cosineSimilarity(vector, embedding))
          : undefined;
      return { ...rest, ...(matchScore !== undefined ? { matchScore } : {}), source: "external" };
    });
    if (vector) {
      external = external.sort(
        (a: any, b: any) => (b.matchScore ?? -1) - (a.matchScore ?? -1)
      );
    }

    const internal = internalJobs.map((j) => ({ ...j, source: "internal" }));
    const internalTotal = page === 1 ? internal.length : 0;

    return NextResponse.json({
      jobs: [...internal, ...external],
      total: externalTotal + internalTotal,
      externalTotal,
      internalTotal,
      page,
      pages: Math.max(1, Math.ceil(externalTotal / limit)),
      personalized: !!vector,
    });
  } catch (err) {
    console.error("❌ job search error:", err);
    return NextResponse.json({ message: "Search failed" }, { status: 500 });
  }
}
