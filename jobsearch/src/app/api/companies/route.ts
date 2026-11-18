import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs, { TECH_LISTING } from "@/app/models/ExternalJobs";
import { stripMarkdown } from "@/app/lib/content/plain";
import { looksLikePlace } from "@/app/lib/locations/normalizeLocation";
import { ROLE_KEY } from "@/app/lib/jobs/listing";
import CompanySource from "@/app/models/CompanySource";
import { resolveLogoDomain, getLogoUrl } from "@/app/lib/scout/logo";
import { memo, ttl, PUBLIC_CACHE } from "@/app/lib/cache";
import { profilesFor } from "@/app/lib/companies/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/companies?q=&limit=
 * Companies with open postings in the catalog: job count, junior count,
 * cities, logo domain, careers URL. Sorted by job count.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 60);
  const rawLimit = parseInt(req.nextUrl.searchParams.get("limit") || "300", 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 1000) : 300;

  try {
    const companies = await memo(`companies:${q}:${limit}`, ttl(5 * 60_000), () => computeCompanies(q, limit));
    return NextResponse.json({ companies, total: companies.length }, { headers: PUBLIC_CACHE });
  } catch (err) {
    console.error("❌ companies error:", err);
    return NextResponse.json({ message: "Failed to load companies" }, { status: 500 });
  }
}

async function computeCompanies(q: string, limit: number) {
  {
    await connectToDatabase();
    // The feed's scope exactly: open tech-industry roles, one per (company, title) — so a company's number here
    // is the number its "view jobs" link lands on.
    const match: Record<string, unknown> = { ...TECH_LISTING, company: { $nin: ["", null] } };
    if (q) match.company = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };

    const [rows, sources] = await Promise.all([
      ExternalJobs.aggregate([
        { $match: match },
        // One row per role (company + title key), then the company totals.
        {
          $group: {
            _id: { company: "$company", titleKey: ROLE_KEY.titleKey },
            junior: { $max: { $cond: [{ $regexMatch: { input: { $ifNull: ["$job", ""] }, regex: /junior|entry[- ]?level|graduate|intern|student/i } }, 1, 0] } },
            remote: { $max: { $cond: [{ $eq: ["$remote", true] }, 1, 0] } },
            cities: { $addToSet: "$city" },
            domain: { $first: "$companyDomain" },
            latest: { $max: "$postedAt" },
          },
        },
        {
          $group: {
            _id: "$_id.company",
            jobs: { $sum: 1 },
            junior: { $sum: "$junior" },
            remote: { $sum: "$remote" },
            cities: { $addToSet: "$cities" },
            domain: { $first: "$domain" },
            latest: { $max: "$latest" },
          },
        },
        { $set: { cities: { $setUnion: { $reduce: { input: "$cities", initialValue: [], in: { $setUnion: ["$$value", "$$this"] } } } } } },
        { $sort: { jobs: -1, _id: 1 } },
        { $limit: limit },
      ]),
      CompanySource.find({}, "companyName domain careersUrl atsType").lean(),
    ]);
    const bySource = new Map<string, any>((sources as any[]).map((s) => [s.companyName, s]));
    const profiles = await profilesFor((rows as any[]).map((r) => r._id));

    const companies = (rows as any[]).map((r) => {
      const src = bySource.get(r._id);
      const domain = resolveLogoDomain(src?.domain || r.domain, r._id);
      const profile = profiles.get(r._id);
      return {
        name: r._id,
        jobs: r.jobs,
        junior: r.junior,
        remote: r.remote,
        // A job number or a word about the job in a posting's city field is not a city here either (lib/locations/normalizeLocation.ts).
        cities: (r.cities || []).filter((c: string) => c && c !== "Unknown" && looksLikePlace(c)).slice(0, 4),
        domain,
        logoUrl: getLogoUrl(domain),
        careersUrl: src?.careersUrl || "",
        latest: r.latest,
        summary: stripMarkdown(profile?.summary || ""),
        industry: profile?.industry || "",
        hq: profile?.hq || "",
        size: profile?.size || "",
      };
    });
    return companies;
  }
}
