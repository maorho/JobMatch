import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs, { OPEN_JOBS } from "@/app/models/ExternalJobs";
import { PRACTICE_ROLES, ROLE_INFO, roleTitleRegex, type PracticeRole } from "@/app/lib/practice/roles";
import { memo, ttl } from "@/app/lib/cache";

/**
 * Data for the public hub pages (/jobs/role/<role>, /jobs/in/<city>): the
 * landing pages search engines send people to ("משרות Backend בישראל",
 * "משרות הייטק בחיפה"). Everything is read from the open catalogue and
 * cached briefly; the pages themselves are ISR.
 */
export const HUB_ROLES = PRACTICE_ROLES;
export type HubRole = PracticeRole;
export const isHubRole = (s: string): s is HubRole => (PRACTICE_ROLES as readonly string[]).includes(s);

export const ROLE_HE: Record<HubRole, string> = { frontend: "Frontend", backend: "Backend", fullstack: "Full Stack", data: "Data ו-ML", devops: "DevOps", qa: "QA ואוטומציה", mobile: "Mobile" };

export type HubJob = { _id: string; job: string; company: string; city: string; country: string; remote?: boolean; logoUrl?: string; companyDomain?: string; firstSeenAt?: Date; postedAt?: Date; experienceMin?: number | null; tech?: string[]; /** "היום" / "אתמול" / "לפני N ימים", computed when the data is read */ ageLabel: string };
export type HubData = { total: number; juniorCount: number; jobs: HubJob[]; cities: { city: string; n: number }[]; tech: { tech: string; n: number }[]; companies: number };

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
    const ageLabel = (d?: Date) => {
      if (!d) return "";
      const days = Math.max(0, Math.round((now - new Date(d).getTime()) / 86_400_000));
      return days === 0 ? "היום" : days === 1 ? "אתמול" : `לפני ${days} ימים`;
    };
    return {
      total,
      juniorCount,
      jobs: (jobs as any[]).map((j) => ({ ...j, _id: String(j._id), ageLabel: ageLabel(j.postedAt || j.firstSeenAt) })),
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

export const roleLabel = (role: HubRole) => ROLE_HE[role] || ROLE_INFO[role].en;
export const citySlug = (city: string) => encodeURIComponent(city);
