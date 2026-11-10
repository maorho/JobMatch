import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs, { OPEN_JOBS } from "@/app/models/ExternalJobs";
import { roleTitleRegex } from "@/app/lib/practice/roles";
import type { HubRole } from "./hubsShared";
import { memo, ttl } from "@/app/lib/cache";

/**
 * Data for the public hub pages (/jobs/role/<role>, /jobs/in/<city>): the
 * landing pages search engines send people to ("משרות Backend בישראל",
 * "משרות הייטק בחיפה"). Everything is read from the open catalogue and
 * cached briefly; the pages themselves are ISR.
 */
export { HUB_ROLES, isHubRole, ROLE_HE, roleLabel, citySlug } from "./hubsShared";
export type { HubRole, HubJob, HubData } from "./hubsShared";
import type { HubData } from "./hubsShared";

const SELECT = "job company city country remote logoUrl companyDomain firstSeenAt postedAt experienceMin tech";
const LIST = 60;
const HUB_TTL = ttl(10 * 60_000);

const EMPTY: HubData = { total: 0, juniorCount: 0, jobs: [], cities: [], tech: [], companies: 0 };

/** Never throws: a hub page renders (empty) even when the database is unreachable at build time. */
async function hubFor(match: Record<string, unknown>, key: string): Promise<HubData> {
  return hubForOrThrow(match, key).catch((e) => {
    console.warn(`[hubs] ${key}: ${(e as Error)?.message}`);
    return EMPTY;
  });
}

async function hubForOrThrow(match: Record<string, unknown>, key: string): Promise<HubData> {
  return memo(`hub:${key}`, HUB_TTL, async () => {
    await connectToDatabase();
    const filter = { ...OPEN_JOBS, ...match };
    const [total, juniorCount, jobs, cities, tech, companies] = await Promise.all([
      ExternalJobs.countDocuments(filter),
      ExternalJobs.countDocuments({ ...filter, experienceMin: { $lte: 2 } }),
      ExternalJobs.find(filter).select(SELECT).sort({ firstSeenAt: -1 }).limit(LIST).lean(),
      ExternalJobs.aggregate([{ $match: { ...filter, city: { $nin: ["", null, "Unknown"] } } }, { $group: { _id: "$city", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }]),
      ExternalJobs.aggregate([{ $match: { ...filter, "tech.0": { $exists: true } } }, { $unwind: "$tech" }, { $group: { _id: "$tech", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 12 }]),
      ExternalJobs.distinct("company", filter).then((c) => c.length),
    ]);
    const now = Date.now();
    const ageDays = (d?: Date) => (d ? Math.max(0, Math.round((now - new Date(d).getTime()) / 86_400_000)) : null);
    return {
      total,
      juniorCount,
      jobs: (jobs as any[]).map((j) => ({
        _id: String(j._id),
        job: String(j.job || ""),
        company: String(j.company || ""),
        city: String(j.city || ""),
        country: String(j.country || ""),
        remote: !!j.remote,
        logoUrl: j.logoUrl ? String(j.logoUrl) : undefined,
        companyDomain: j.companyDomain ? String(j.companyDomain) : undefined,
        firstSeenAt: j.firstSeenAt ? new Date(j.firstSeenAt).toISOString() : undefined,
        postedAt: j.postedAt ? new Date(j.postedAt).toISOString() : undefined,
        experienceMin: j.experienceMin ?? null,
        tech: Array.isArray(j.tech) ? j.tech.map(String) : [],
        ageDays: ageDays(j.postedAt || j.firstSeenAt),
      })),
      cities: (cities as any[]).map((c) => ({ city: String(c._id), n: c.n })),
      tech: (tech as any[]).map((t) => ({ tech: String(t._id), n: t.n })),
      companies,
    };
  });
}

/** One role family: titles matching the family's pattern (the same one the search profile uses). */
export const roleHub = (role: HubRole) => hubFor({ job: { $regex: roleTitleRegex(role).source, $options: "i" } }, `role:${role}`);

/** One city (exact, case-insensitive); "remote" lists remote postings. */
export const cityHub = (city: string) =>
  city.toLowerCase() === "remote"
    ? hubFor({ remote: true }, "city:remote")
    : hubFor({ city: { $regex: `^${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } }, `city:${city.toLowerCase()}`);

/** The cities worth a hub page: the most common ones in the open catalogue. */
export async function topCities(limit = 25): Promise<{ city: string; n: number }[]> {
  return topCitiesOrThrow(limit).catch(() => []);
}

async function topCitiesOrThrow(limit: number): Promise<{ city: string; n: number }[]> {
  return memo(`hub:cities:${limit}`, HUB_TTL, async () => {
    await connectToDatabase();
    const rows: any[] = await ExternalJobs.aggregate([{ $match: { ...OPEN_JOBS, country: "Israel", city: { $nin: ["", null, "Unknown"] } } }, { $group: { _id: "$city", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: limit }]);
    return rows.map((r) => ({ city: String(r._id), n: r.n }));
  });
}

