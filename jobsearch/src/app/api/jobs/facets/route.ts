import { NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import Job from "@/app/models/Job";
import Company from "@/app/models/Company"; // registers the model for populate()
import ExternalJobs from "@/app/models/ExternalJobs";
import { SENIORITY_LEVELS, WORK_MODES } from "@/app/lib/jobTaxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Values come normalized from the location agent; this is the safety net for
// anything not yet normalized (multi-location strings, addresses, "Unknown").
const JUNK = /;|\||•|\b(st\.|street|floor|suite)\b/i;
const ADDRESS_NUMBERS = /\d{2,}/; // street numbers / zip codes in location strings — not for company names (Team8, "Company 12")
const clean = (values: unknown[], opts: { location?: boolean } = {}): string[] =>
  Array.from(
    new Set(
      values
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter((v) => v && v !== "Unknown" && v !== "Remote" && v.length <= 40 && !JUNK.test(v) && !(opts.location && ADDRESS_NUMBERS.test(v)))
    )
  ).sort((a, b) => a.localeCompare(b));

/**
 * Filter options computed over the WHOLE catalog (internal + external), so
 * the dropdowns offer every company/city/country in the DB — not just the
 * ones on the page that happens to be loaded.
 */
export async function GET() {
  try {
    await connectToDatabase();

    const [extCompanies, extCities, extCountries, internal] = await Promise.all([
      ExternalJobs.distinct("company"),
      ExternalJobs.distinct("city"),
      ExternalJobs.distinct("country"),
      // Internal postings are few; one populated read covers all three facets.
      Job.find({}, "company city country")
        .populate({ path: "company", model: Company, select: "companyName" })
        .lean(),
    ]);

    const internalCompanies = internal.map((j: any) => j.company?.companyName);
    const internalCities = internal.map((j: any) => j.city);
    const internalCountries = internal.map((j: any) => j.country);

    const res = NextResponse.json({
      companies: clean([...extCompanies, ...internalCompanies]),
      cities: clean([...extCities, ...internalCities], { location: true }),
      countries: clean([...extCountries, ...internalCountries], { location: true }),
      jobTypes: [...WORK_MODES],
      seniority: [...SENIORITY_LEVELS],
    });
    // Facets change only when the Scout ingests; let the CDN/browser hold them briefly.
    res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return res;
  } catch (err) {
    console.error("❌ facets error:", err);
    return NextResponse.json({ message: "Failed to load facets" }, { status: 500 });
  }
}
