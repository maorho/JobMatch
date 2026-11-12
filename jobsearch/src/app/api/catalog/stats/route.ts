import { NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs, { OPEN_JOBS, TECH_LISTING } from "@/app/models/ExternalJobs";
import { postedWithinFilter } from "@/app/lib/jobs/posted";
import CompanySource from "@/app/models/CompanySource";
import { memo, ttl, PUBLIC_CACHE } from "@/app/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public, cached: the numbers the landing page states (open jobs, companies, sources, last poll, new in 24h). */
export async function GET() {
  const stats = await memo("catalog-stats", ttl(5 * 60_000), async () => {
    await connectToDatabase();
    const since = new Date(Date.now() - 86_400_000);
    // Roles, not listings: the same role at several locations is one card in the feed, so it is one here too.
    const roleKey = { company: { $toLower: "$company" }, titleKey: { $ifNull: ["$titleKey", { $toString: "$_id" }] } };
    const roles = async (match: Record<string, unknown>) => {
      const r: { n: number }[] = await ExternalJobs.aggregate([{ $match: match }, { $group: { _id: roleKey } }, { $count: "n" }]);
      return r[0]?.n || 0;
    };
    const [jobs, postings, companies, sources, newLast24h, last] = await Promise.all([
      roles(TECH_LISTING),
      ExternalJobs.countDocuments(OPEN_JOBS),
      ExternalJobs.distinct("company", OPEN_JOBS).then((c) => c.length),
      CompanySource.countDocuments({ enabled: true }),
      roles({ ...TECH_LISTING, ...postedWithinFilter(since) }), // the same rule as ?posted=1
      CompanySource.findOne({ enabled: true, lastPolledAt: { $ne: null } }).sort({ lastPolledAt: -1 }).select("lastPolledAt").lean() as Promise<any>,
    ]);
    return { jobs, postings, companies, sources, newLast24h, lastPolledAt: last?.lastPolledAt || null };
  });
  return NextResponse.json(stats, { headers: PUBLIC_CACHE });
}
