import ExternalJobs, { TECH_LISTING } from "@/app/models/ExternalJobs";
import { memo, ttl } from "@/app/lib/cache";

/**
 * The catalogue's headline numbers, defined once. A "job" everywhere the
 * product shows a count is a ROLE in the default scope — an open,
 * tech-industry posting, the same role at several locations counted once —
 * exactly what the feed lists. The hero, the feed's "of N", the Companies
 * page and /api/catalog/stats all read these, so they agree by construction.
 * Raw listings are a different number and are always labelled "postings".
 */
export const ROLE_KEY = { company: { $toLower: "$company" }, titleKey: { $ifNull: ["$titleKey", { $toString: "$_id" }] } } as const;

export async function countRoles(match: Record<string, unknown> = TECH_LISTING): Promise<number> {
  const r: { n: number }[] = await ExternalJobs.aggregate([{ $match: match }, { $group: { _id: ROLE_KEY } }, { $count: "n" }]);
  return r[0]?.n || 0;
}

export async function countCompanies(match: Record<string, unknown> = TECH_LISTING): Promise<number> {
  return (await ExternalJobs.distinct("company", { ...match, company: { $nin: ["", null] } })).length;
}

/** Roles in the default scope, cached briefly and shared by every route that shows the headline number. */
export const catalogRoles = () => memo("catalog-roles", ttl(5 * 60_000), () => countRoles(TECH_LISTING));
