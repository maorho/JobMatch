import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs, { OPEN_JOBS } from "@/app/models/ExternalJobs";
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
    // "Companies with open postings": closed jobs don't count.
    const match: Record<string, unknown> = { ...OPEN_JOBS, company: { $nin: ["", null] } };
    if (q) match.company = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };

    const [rows, sources] = await Promise.all([
      ExternalJobs.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$company",
            jobs: { $sum: 1 },
            junior: { $sum: { $cond: [{ $regexMatch: { input: { $ifNull: ["$job", ""] }, regex: /junior|entry[- ]?level|graduate|intern|student/i } }, 1, 0] } },
            remote: { $sum: { $cond: [{ $eq: ["$remote", true] }, 1, 0] } },
            cities: { $addToSet: "$city" },
            domain: { $first: "$companyDomain" },
            latest: { $max: "$postedAt" },
          },
        },
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
        cities: (r.cities || []).filter((c: string) => c && c !== "Unknown").slice(0, 4),
        domain,
        logoUrl: getLogoUrl(domain),
        careersUrl: src?.careersUrl || "",
        latest: r.latest,
        summary: profile?.summary || "",
        industry: profile?.industry || "",
        hq: profile?.hq || "",
        size: profile?.size || "",
      };
    });
    return companies;
  }
}
