import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

vi.mock("@/app/lib/matcher/embeddings", async () => import("../setup/fakeEmbedder"));

import ExternalJobs from "@/app/models/ExternalJobs";
import User from "@/app/models/User";
import MatchCache from "@/app/models/MatchCache";
import { signJwt } from "@/app/lib/jwt";
import { embedPendingJobs } from "@/app/lib/matcher/embedJobs";
import { embedAndStoreResume } from "@/app/lib/matcher/candidateProfile";
import { invalidate } from "@/app/lib/cache";
import { titleKey } from "@/app/lib/jobs/enrich";
import { GET as feedGET } from "@/app/api/matcher/feed/route";
import { GET as searchGET } from "@/app/api/jobs/search/route";
import { GET as explainGET } from "@/app/api/matcher/explain/route";
import { GET as companiesGET } from "@/app/api/companies/route";

setupTestDb();

const O = "http://localhost";
let dana = "", token = "", jobId = "";
const authed = (url: string) => new NextRequest(`${O}${url}`, { headers: { cookie: `token=${token}` } });
const ext = (o: Record<string, unknown>) => ({
  job: "Junior React Developer", company: "Inmanage", city: "Tel Aviv", country: "Israel", url: "https://x/" + Math.random(), finalUrl: "https://x/" + Math.random(),
  description: "React, TypeScript, Node.js", skills: [], seniority: [], source: "greenhouse", sourceJobId: String(Math.random()), postedAt: new Date(), ...o,
  titleKey: titleKey(String(o.job || "Junior React Developer")),
});

/** The three places a signed-in person sees a number for the same posting. */
async function threeWays(id: string) {
  invalidate("rank:"); // the ranked list is memoised per instance; a new verdict must be seen
  invalidate("search:");
  const feed = await (await feedGET(authed("/api/matcher/feed?limit=10"))).json();
  const search = await (await searchGET(authed("/api/jobs/search?me=1&limit=10"))).json();
  const explain = await (await explainGET(authed(`/api/matcher/explain?jobId=${id}`))).json();
  const f = feed.jobs.find((j: any) => String(j._id) === id);
  const s = search.jobs.find((j: any) => String(j._id) === id);
  return { feed: f && { score: f.matchScore, reranked: f.reranked }, search: s && { score: s.matchScore, reranked: s.reranked }, explain: { score: explain.fit, reranked: explain.reranked, heuristic: explain.heuristic } };
}

beforeAll(async () => {
  await resetDb();
  const docs = await ExternalJobs.insertMany([ext({ sourceJobId: "react" }), ext({ job: "Backend Engineer", company: "Inmanage", description: "Go, Kubernetes", sourceJobId: "go" }), ext({ job: "Claims Specialist", company: "Inmanage", description: "insurance claims", techRole: false, sourceJobId: "claims" })]);
  jobId = String(docs[0]._id);
  dana = String((await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana", phone: "0", level: "junior" } as any))._id);
  token = await signJwt({ id: dana });
  await embedPendingJobs();
  await embedAndStoreResume(dana, "Junior frontend developer with React, TypeScript and Node.js");
});

describe("one match score for the same résumé and posting", () => {
  it("without a verdict, the feed, the signed-in search and the job page show the same estimate and say so", async () => {
    const r = await threeWays(jobId);
    expect(r.feed?.score).toBeGreaterThan(0);
    expect(r.search?.score).toBe(r.feed?.score);
    expect(r.explain.score).toBe(r.feed?.score);
    expect(r.explain.heuristic).toBe(r.feed?.score);
    expect([r.feed?.reranked, r.search?.reranked, r.explain.reranked]).toEqual([false, false, false]);
  });

  it("with a cached verdict, all three show the verdict and mark it as such", async () => {
    const u: any = await User.findById(dana).select("resumeUpdatedAt").lean();
    await MatchCache.create({ userId: dana, jobId, resumeVersion: new Date(u.resumeUpdatedAt).getTime(), fit: 82, why: "ניסיון ה-React שלך הוא ליבת התפקיד", whyEn: "Your React is the core of the role", matched: ["React", "TypeScript"], gaps: [] });
    const r = await threeWays(jobId);
    expect(r.feed?.score).toBe(82);
    expect(r.search?.score).toBe(82);
    expect(r.explain.score).toBe(82);
    expect([r.feed?.reranked, r.search?.reranked, r.explain.reranked]).toEqual([true, true, true]);
  });

  it("the Companies page counts the roles the feed shows (tech roles, one per title), and its link lands on the same list", async () => {
    const companies = await (await companiesGET(new NextRequest(`${O}/api/companies`))).json();
    const inmanage = companies.companies.find((c: any) => c.name === "Inmanage");
    expect(inmanage.jobs).toBe(2); // React + Go; the claims role is not a tech role
    invalidate("search:");
    const listed = await (await searchGET(new NextRequest(`${O}/api/jobs/search?company=Inmanage`))).json();
    expect(listed.total).toBe(2);
    expect((await (await searchGET(new NextRequest(`${O}/api/jobs/search?company=Inmanage&all=1`))).json()).total).toBe(3);
  });
});
