import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import CompanySource from "@/app/models/CompanySource";
import ExternalJobs from "@/app/models/ExternalJobs";
import Candidates from "@/app/models/Candidates";
import { normalizeDomain } from "@/app/lib/scout/logo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List configured company sources. Guarded, and never returns the ATS token
// (secondaryIdentifier) to avoid leaking credentials.
export async function GET(req: NextRequest) {
  const secret = (req.nextUrl.searchParams.get("cron_secret") ?? "").trim();
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectToDatabase();
  const sources = await CompanySource.find()
    .select("-secondaryIdentifier")
    .sort({ companyName: 1 });
  return NextResponse.json({ sources });
}

/**
 * Upsert a company source. Guarded by cron_secret for now; wire to admin auth
 * before exposing in the UI. Body:
 *   { companyName, atsType, identifier, secondaryIdentifier?, domain?,
 *     careersUrl?, enabled? }
 */
export async function POST(req: NextRequest) {
  const secret = (req.nextUrl.searchParams.get("cron_secret") ?? "").trim();
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const body = await req.json().catch(() => ({}));
  const { companyName, atsType, identifier } = body ?? {};
  if (!companyName || !atsType || !identifier) {
    return NextResponse.json(
      { error: "companyName, atsType and identifier are required" },
      { status: 400 }
    );
  }

  const update = {
    companyName,
    atsType,
    identifier,
    secondaryIdentifier: body.secondaryIdentifier ?? undefined,
    domain: normalizeDomain(body.domain ?? ""),
    careersUrl: body.careersUrl ?? "",
    enabled: body.enabled ?? true,
  };

  const source = await CompanySource.findOneAndUpdate(
    { atsType, identifier },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return NextResponse.json({ ok: true, source });
}

/**
 * Delete a company source and (optionally) the jobs ingested from it.
 * Guarded by cron_secret. Query:
 *   ?company=Name         match source(s) by company name, OR
 *   ?atsType=..&identifier=..   match one exact source
 *   ?purgeJobs=1          also delete that company's ingested ExternalJobs
 */
export async function DELETE(req: NextRequest) {
  const secret = (req.nextUrl.searchParams.get("cron_secret") ?? "").trim();
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const sp = req.nextUrl.searchParams;
  const company = sp.get("company") || undefined;
  const atsType = sp.get("atsType") || undefined;
  const identifier = sp.get("identifier") || undefined;
  const purgeJobs = sp.get("purgeJobs") === "1";

  // Require a specific target: a company name, or an exact atsType+identifier.
  // atsType alone is rejected so a single request can't wipe every source on
  // an ATS (and purge all their jobs).
  const filter: Record<string, unknown> = {};
  if (company) {
    filter.companyName = company;
  } else if (atsType && identifier) {
    filter.atsType = atsType;
    filter.identifier = identifier;
  } else {
    return NextResponse.json(
      { error: "Provide company, or atsType + identifier" },
      { status: 400 }
    );
  }

  const sources = await CompanySource.find(filter);
  let jobsDeleted = 0;
  if (purgeJobs && sources.length) {
    // Only delete jobs that belong to the matched source(s), by companySource.
    const sourceIds = sources.map((s) => s._id);
    const jobs = await ExternalJobs.find({
      companySource: { $in: sourceIds },
    }).select("_id");
    const jobIds = jobs.map((j) => j._id);
    // Cascade: remove orphaned application records before deleting the jobs.
    if (jobIds.length) {
      await Candidates.deleteMany({
        jobModel: "ExternalJobs",
        jobId: { $in: jobIds },
      });
    }
    const res = await ExternalJobs.deleteMany({
      companySource: { $in: sourceIds },
    });
    jobsDeleted = res.deletedCount ?? 0;
  }
  const srcRes = await CompanySource.deleteMany(filter);

  return NextResponse.json({
    ok: true,
    sourcesDeleted: srcRes.deletedCount ?? 0,
    jobsDeleted,
  });
}
