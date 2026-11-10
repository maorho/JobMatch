import { PRACTICE_ROLES, ROLE_INFO, type PracticeRole } from "@/app/lib/practice/roles";

/** The parts of the hub pages that the client component needs: no database imports here. */
export const HUB_ROLES = PRACTICE_ROLES;
export type HubRole = PracticeRole;
export const isHubRole = (s: string): s is HubRole => (PRACTICE_ROLES as readonly string[]).includes(s);
export const ROLE_HE: Record<HubRole, string> = { frontend: "Frontend", backend: "Backend", fullstack: "Full Stack", data: "Data ו-ML", devops: "DevOps", qa: "QA ואוטומציה", mobile: "Mobile" };
export const roleLabel = (role: HubRole) => ROLE_HE[role] || ROLE_INFO[role].en;
export const citySlug = (city: string) => encodeURIComponent(city);

/** Plain JSON (the hub page is a client component): dates are ISO strings, the age is a day count, labelled on the client in the interface language. */
export type HubJob = { _id: string; job: string; company: string; city: string; country: string; remote?: boolean; logoUrl?: string; companyDomain?: string; firstSeenAt?: string; postedAt?: string; experienceMin?: number | null; tech?: string[]; ageDays: number | null };
export type HubData = { total: number; juniorCount: number; jobs: HubJob[]; cities: { city: string; n: number }[]; tech: { tech: string; n: number }[]; companies: number };
