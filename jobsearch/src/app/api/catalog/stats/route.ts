import { NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs, { OPEN_JOBS } from "@/app/models/ExternalJobs";
import CompanySource from "@/app/models/CompanySource";
import { memo, ttl, PUBLIC_CACHE } from "@/app/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public, cached: the numbers the landing page states (open jobs, companies, sources, last poll, new in 24h). */
export async function GET() {
  const stats = await memo("catalog-stats", ttl(5 * 60_000), async () => {
    await connectToDatabase();
    const since = new Date(Date.now() - 86_400_000);
    const [jobs, companies, sources, newLast24h, last] = await Promise.all([
      ExternalJobs.countDocuments(OPEN_JOBS),
      ExternalJobs.distinct("company", OPEN_JOBS).then((c) => c.length),
      CompanySource.countDocuments({ enabled: true }),
      ExternalJobs.countDocuments({ ...OPEN_JOBS, firstSeenAt: { $gte: since } }),
      CompanySource.findOne({ enabled: true, lastPolledAt: { $ne: null } }).sort({ lastPolledAt: -1 }).select("lastPolledAt").lean() as Promise<any>,
    ]);
    return { jobs, companies, sources, newLast24h, lastPolledAt: last?.lastPolledAt || null };
  });
  return NextResponse.json(stats, { headers: PUBLIC_CACHE });
}
