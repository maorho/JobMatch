import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import CompanySource from "@/app/models/CompanySource";
import ExternalJobs, { OPEN_JOBS } from "@/app/models/ExternalJobs";
import { normalizeDomain } from "@/app/lib/scout/logo";
import { requireCron } from "@/app/lib/cron/requireCron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List configured company sources. Guarded, and never returns the ATS token
// (secondaryIdentifier) to avoid leaking credentials.
export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
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
  const denied = requireCron(req);
  if (denied) return denied;

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
 * Delete a company source. Its ingested jobs are soft-closed (nobody polls
 * them any more); applications are never touched. Guarded by cron_secret. Query:
 *   ?company=Name         match source(s) by company name, OR
 *   ?atsType=..&identifier=..   match one exact source
 *   ?purgeJobs=1          admin escape hatch: hard-delete that company's
 *                         ingested ExternalJobs instead of closing them
 */
export async function DELETE(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

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
  let jobsClosed = 0;
  if (sources.length) {
    // Only the jobs that belong to the matched source(s), by companySource.
    const sourceIds = sources.map((s) => s._id);
    if (purgeJobs) {
      const res = await ExternalJobs.deleteMany({ companySource: { $in: sourceIds } });
      jobsDeleted = res.deletedCount ?? 0;
    } else {
      const res = await ExternalJobs.updateMany({ companySource: { $in: sourceIds }, ...OPEN_JOBS }, { $set: { active: false, closedAt: new Date() } });
      jobsClosed = res.modifiedCount ?? 0;
    }
  }
  const srcRes = await CompanySource.deleteMany(filter);

  return NextResponse.json({
    ok: true,
    sourcesDeleted: srcRes.deletedCount ?? 0,
    jobsDeleted,
    jobsClosed,
  });
}
