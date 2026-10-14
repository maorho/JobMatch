import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

vi.mock("@/app/lib/matcher/embeddings", async () => import("../setup/fakeEmbedder"));

import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import { embedPendingJobs } from "@/app/lib/matcher/embedJobs";
import { embedAndStoreResume } from "@/app/lib/matcher/candidateProfile";
import { signJwt } from "@/app/lib/jwt";
import { normalizeSearchProfile, profileText, profileReject, saveSearchProfile, candidateSearchVector, hasSearchProfile } from "@/app/lib/matcher/searchProfile";
import { roleTitleMatches } from "@/app/lib/practice/roles";
import { rankForUser, loadCandidateProfile } from "@/app/lib/matcher/hybrid";
import { GET as spGET, POST as spPOST } from "@/app/api/settings/search-profile/route";
import { GET as obGET, POST as obPOST } from "@/app/api/onboarding/route";

setupTestDb();

const job = (title: string, description: string, extra: object = {}) => ({ job: title, company: "Acme", city: "Tel Aviv", country: "Israel", url: "https://x/" + title, finalUrl: "https://x/" + title, description, skills: [], seniority: [], source: "greenhouse", sourceJobId: title, postedAt: new Date(), ...extra });

let dana = "";
let token = "";
beforeAll(async () => {
  await resetDb();
  await ExternalJobs.insertMany([
    job("Junior React Developer", "React TypeScript frontend web developer CSS hooks"),
    job("Senior Frontend Engineer", "React TypeScript frontend architecture leadership 8 years"),
    job("Frontend Developer (Haifa)", "React TypeScript frontend web developer", { city: "Haifa" }),
    job("Remote Frontend Developer", "React TypeScript frontend web developer remote", { city: "Unknown", remote: true }),
    job("Customer Success Manager", "React customers frontend web product success"),
    job("Data Scientist", "Python pandas machine learning ML statistics SQL"),
  ]);
  await embedPendingJobs();
  dana = String((await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana", phone: "0" } as any))._id);
  await embedAndStoreResume(dana, "Junior frontend developer. React, TypeScript, CSS, web apps with hooks. 1 year.");
  token = await signJwt({ id: dana });
});
const authed = (url: string, init: RequestInit = {}) => new NextRequest(`http://localhost${url}`, { ...init, headers: { cookie: `token=${token}`, "Content-Type": "application/json", ...(init.headers || {}) } } as any);

describe("search profile", () => {
  it("normalises input, renders the target text, and matches titles by role family", () => {
    const sp = normalizeSearchProfile({ roles: ["frontend", "nope", "data"], level: "junior", cities: [" Tel Aviv ", ""], workModes: ["Remote", "Mars"], keywords: ["React", "React", "fintech"] });
    expect(sp).toEqual({ roles: ["frontend", "data"], level: "junior", cities: ["Tel Aviv"], workModes: ["Remote"], keywords: ["React", "React", "fintech"] });
    expect(profileText(sp)).toMatch(/^junior Frontend Developer, Data Scientist \/ Analyst\. React, TypeScript/);
    expect(hasSearchProfile(normalizeSearchProfile({}))).toBe(false);
    expect(roleTitleMatches("Junior React Developer", ["frontend"])).toBe(true);
    expect(roleTitleMatches("Full Stack Engineer", ["frontend"])).toBe(true);
    expect(roleTitleMatches("Backend Developer (Go)", ["frontend"])).toBe(false);
    expect(roleTitleMatches("Software Engineer", ["backend"])).toBe(true); // generic engineering title fits every family
    expect(roleTitleMatches("Customer Success Manager", ["frontend", "backend"])).toBe(false);
    expect(roleTitleMatches("DevOps Engineer", ["devops"])).toBe(true);
    expect(roleTitleMatches("NOC Engineer", ["frontend"])).toBe(false);
    expect(roleTitleMatches("Security Engineer", ["backend"])).toBe(false);
    expect(roleTitleMatches("Web Developer", ["frontend"])).toBe(true);
    expect(roleTitleMatches("Recruiter (Maternity Leave cover)", ["frontend"])).toBe(false);
    expect(roleTitleMatches("RevOps & AI Operations", ["backend"])).toBe(false);
  });

  it("hard-filters by role, level band and place", () => {
    const sp = normalizeSearchProfile({ roles: ["frontend"], level: "junior", cities: ["Tel Aviv"], workModes: ["Hybrid", "On Site"] });
    expect(profileReject(sp, { job: "Junior React Developer", city: "Tel Aviv", country: "Israel", levelFit: 1 })).toBeNull();
    expect(profileReject(sp, { job: "Customer Success Manager", city: "Tel Aviv", levelFit: 1 })).toBe("role");
    expect(profileReject(sp, { job: "Senior Frontend Engineer", city: "Tel Aviv", levelFit: 0.15 })).toBe("level");
    expect(profileReject(sp, { job: "Frontend Developer", city: "Haifa", levelFit: 1 })).toBe("location");
    expect(profileReject(sp, { job: "Remote Frontend Developer", city: "Unknown", remote: true, levelFit: 1 })).toBe("location"); // remote not wanted
    const remoteOk = normalizeSearchProfile({ roles: ["frontend"], cities: ["Tel Aviv"], workModes: ["Remote", "Hybrid"] });
    expect(profileReject(remoteOk, { job: "Remote Frontend Developer", city: "Unknown", remote: true, levelFit: 1 })).toBeNull();
    expect(profileReject(normalizeSearchProfile({ cities: ["tel aviv"] }), { job: "Anything", city: "Tel Aviv-Yafo", levelFit: 1 })).toBeNull(); // case-insensitive, partial
  });

  it("the feed obeys the profile: only junior frontend roles in Tel Aviv (or remote) survive, and the vector is cached", async () => {
    const before = await rankForUser(dana, { limit: 20, rerank: false });
    expect(before.jobs.length).toBe(6); // résumé only: everything in the pool
    await saveSearchProfile(dana, { roles: ["frontend"], level: "junior", cities: ["Tel Aviv"], workModes: ["Remote", "Hybrid", "On Site"], keywords: ["React"] });
    const sv = await candidateSearchVector(dana);
    expect(sv.vector).toHaveLength(64);
    expect(sv.profile?.roles).toEqual(["frontend"]);
    const u: any = await User.findById(dana).select("searchVectorKey +searchVector level").lean();
    expect(u.searchVectorKey).toBeTruthy();
    expect(u.level).toBe("junior");
    const again = await candidateSearchVector(dana);
    expect(again.vector).toEqual(sv.vector); // served from the cache
    // A new résumé (PDF upload / ResumeAI) bumps the résumé version and drops the cached blend, so every match cache rolls over.
    const prior: any = await User.findById(dana).select("resumeUpdatedAt").lean();
    await embedAndStoreResume(dana, "Junior frontend developer. React, TypeScript, CSS, web apps with hooks. 1 year.");
    const bumped: any = await User.findById(dana).select("searchVectorKey resumeUpdatedAt").lean();
    expect(bumped.searchVectorKey).toBeUndefined();
    expect(new Date(bumped.resumeUpdatedAt).getTime()).toBeGreaterThan(prior?.resumeUpdatedAt ? new Date(prior.resumeUpdatedAt).getTime() - 1 : 0);
    expect((await candidateSearchVector(dana)).vector).toEqual(sv.vector); // recomputed from the same résumé → same blend
    expect(((await User.findById(dana).select("searchVectorKey").lean()) as any).searchVectorKey).toBeTruthy();
    const after = await rankForUser(dana, { limit: 20, rerank: false });
    expect(after.jobs.map((j) => j.job).sort()).toEqual(["Junior React Developer", "Remote Frontend Developer"]);
    expect(after.profile?.searchProfile?.level).toBe("junior");
    expect(after.total).toBe(2);
    const prof = await loadCandidateProfile(dana, { light: true });
    expect(prof?.level).toBe("junior");
  });

  it("the settings API and the onboarding step", async () => {
    const g = await (await spGET(authed("/api/settings/search-profile"))).json();
    expect(g.profile.roles).toEqual(["frontend"]);
    expect(g.options.roles.map((r: any) => r.key)).toContain("devops");
    const p = await (await spPOST(authed("/api/settings/search-profile", { method: "POST", body: JSON.stringify({ roles: ["data"], level: "mid" }) }))).json();
    expect(p.profile).toMatchObject({ roles: ["data"], level: "mid", cities: [], workModes: [], keywords: [] });
    const feed = await rankForUser(dana, { limit: 20, rerank: false });
    expect(feed.jobs.map((j) => j.job)).toEqual(["Data Scientist"]);
    const ob = await (await obGET(authed("/api/onboarding"))).json();
    expect(ob.hasSearchProfile).toBe(true);
    expect((await obPOST(authed("/api/onboarding", { method: "POST", body: JSON.stringify({ searchProfile: { roles: ["qa"] } }) }))).status).toBe(200);
    expect(((await obGET(authed("/api/onboarding"))).json as any) && (await (await spGET(authed("/api/settings/search-profile"))).json()).profile.roles).toEqual(["qa"]);
    expect((await spGET(new NextRequest("http://localhost/api/settings/search-profile"))).status).toBe(401);
  });
});
