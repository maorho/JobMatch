import crypto from "crypto";
import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import { embedText } from "./embeddings";
import { getCandidateVector } from "./candidateProfile";
import { PRACTICE_ROLES, ROLE_INFO, roleTitleMatches, isRole, isLevel, type PracticeRole, type PracticeLevel } from "@/app/lib/practice/roles";
import { WORK_MODES, workModeOf, type WorkMode } from "@/app/lib/jobTaxonomy";

/**
 * "What I'm looking for" — the structured search profile a person sets in
 * onboarding / Settings. It does two things the résumé alone cannot:
 *   1. focus the recall vector (résumé embedding blended with an embedding of
 *      the target: roles, level, keywords), so the pool is about the job they
 *      want, not every job they could theoretically do;
 *   2. hard-filter the ranked list: role families by title, seniority band,
 *      cities / work modes.
 */
export type SearchProfile = {
  roles: PracticeRole[];
  level?: PracticeLevel;
  cities: string[];
  workModes: WorkMode[];
  keywords: string[];
  updatedAt?: Date;
};

export const EMPTY_PROFILE: SearchProfile = { roles: [], cities: [], workModes: [], keywords: [] };
/** Blend: how much of the recall vector comes from the target description vs the résumé. */
const TARGET_WEIGHT = 0.45;

export function normalizeSearchProfile(input: any): SearchProfile {
  const roles = Array.isArray(input?.roles) ? input.roles.filter(isRole).slice(0, 4) : [];
  const level = isLevel(input?.level) ? input.level : undefined;
  const clean = (xs: unknown, max: number, len: number) => (Array.isArray(xs) ? xs.map((x) => String(x || "").trim()).filter(Boolean).slice(0, max).map((x) => x.slice(0, len)) : []);
  const cities = clean(input?.cities, 8, 40);
  const workModes = clean(input?.workModes, 3, 10).filter((m): m is WorkMode => (WORK_MODES as readonly string[]).includes(m));
  const keywords = clean(input?.keywords, 12, 40);
  return { roles, level, cities, workModes, keywords };
}

export const hasSearchProfile = (sp?: SearchProfile | null): sp is SearchProfile => !!sp && (sp.roles.length > 0 || sp.keywords.length > 0 || sp.cities.length > 0 || sp.workModes.length > 0 || !!sp.level);

/** The target as text — what the embedding of "the job I want" is built from. */
export function profileText(sp: SearchProfile): string {
  const roles = sp.roles.map((r) => ROLE_INFO[r].en).join(", ");
  const stack = sp.roles.map((r) => ROLE_INFO[r].stack).join("; ");
  const parts = [sp.level && roles ? `${sp.level} ${roles}` : roles || (sp.level ? `${sp.level} developer` : ""), stack, sp.keywords.join(", "), sp.cities.length ? `Location: ${sp.cities.join(", ")}` : "", sp.workModes.length ? sp.workModes.join(" / ") : ""].filter(Boolean);
  return parts.join(". ").slice(0, 1500);
}

const keyOf = (text: string, resumeVersion: number) => crypto.createHash("sha1").update(`${resumeVersion}|${text}`).digest("hex");

function blend(a: number[] | null, b: number[] | null, wB: number): number[] | null {
  if (!a) return b;
  if (!b || a.length !== b.length) return a;
  const out = a.map((x, i) => (1 - wB) * x + wB * b[i]);
  const norm = Math.sqrt(out.reduce((s, x) => s + x * x, 0)) || 1;
  return out.map((x) => x / norm);
}

/**
 * The recall vector for a user: résumé embedding, blended with the target embedding
 * when a search profile exists (cached on the user by profile text + résumé version).
 */
export async function candidateSearchVector(userId: string): Promise<{ vector: number[] | null; profile: SearchProfile | null; version: number }> {
  await connectToDatabase();
  const u: any = await User.findById(userId).select("searchProfile +searchVector searchVectorKey resumeUpdatedAt").lean();
  const sp = u?.searchProfile ? normalizeSearchProfile(u.searchProfile) : null;
  const version = u?.searchProfile?.updatedAt ? new Date(u.searchProfile.updatedAt).getTime() : 0;
  const resumeVec = await getCandidateVector(userId);
  if (!hasSearchProfile(sp)) return { vector: resumeVec, profile: null, version };
  const text = profileText(sp);
  if (!text) return { vector: resumeVec, profile: sp, version };
  const resumeVersion = u?.resumeUpdatedAt ? new Date(u.resumeUpdatedAt).getTime() : 0;
  const key = keyOf(text, resumeVersion);
  if (u?.searchVectorKey === key && Array.isArray(u.searchVector) && u.searchVector.length) return { vector: u.searchVector, profile: sp, version };
  const target = await embedText(text).catch(() => null);
  const vector = blend(resumeVec, target, resumeVec ? TARGET_WEIGHT : 1);
  if (vector) await User.updateOne({ _id: userId }, { $set: { searchVector: vector, searchVectorKey: key } });
  return { vector, profile: sp, version };
}

export async function saveSearchProfile(userId: string, input: any): Promise<SearchProfile> {
  await connectToDatabase();
  const sp = normalizeSearchProfile(input);
  const updatedAt = new Date();
  await User.updateOne({ _id: userId }, { $set: { searchProfile: { ...sp, updatedAt }, ...(sp.level ? { level: sp.level } : {}) }, $unset: { searchVectorKey: 1 } });
  return { ...sp, updatedAt };
}

export async function getSearchProfile(userId: string): Promise<SearchProfile | null> {
  await connectToDatabase();
  const u: any = await User.findById(userId).select("searchProfile").lean();
  return u?.searchProfile ? { ...normalizeSearchProfile(u.searchProfile), updatedAt: u.searchProfile.updatedAt } : null;
}

export type FilterableJob = { job: string; city?: string; country?: string; remote?: boolean; levelFit: number };

/** Minimum level fit to stay in a profiled feed: drops senior roles for juniors (0.15) and interns for seniors (0.1). */
export const MIN_LEVEL_FIT = 0.3;

/** Hard filters from the profile. Returns why a job was dropped, or null to keep it. */
export function profileReject(sp: SearchProfile, j: FilterableJob): "role" | "level" | "location" | null {
  if (sp.roles.length && !roleTitleMatches(j.job, sp.roles)) return "role";
  if (j.levelFit < MIN_LEVEL_FIT) return "level";
  if (sp.cities.length || sp.workModes.length) {
    const mode = workModeOf({ city: j.city, country: j.country, remote: !!j.remote });
    const remoteOk = mode === "Remote" && (!sp.workModes.length || sp.workModes.includes("Remote"));
    const cityOk = !sp.cities.length || sp.cities.some((c) => (j.city || "").toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes((j.city || "").toLowerCase() || "\u0000"));
    const modeOk = !sp.workModes.length || sp.workModes.includes(mode);
    if (!remoteOk && !(cityOk && modeOk)) return "location";
  }
  return null;
}

export const PROFILE_ROLE_OPTIONS = PRACTICE_ROLES.map((r) => ({ key: r, label: ROLE_INFO[r].he, en: ROLE_INFO[r].en }));
