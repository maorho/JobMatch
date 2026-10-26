import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

vi.mock("@/app/lib/matcher/embeddings", async () => import("../setup/fakeEmbedder"));
// Pretend the LLM is on: a cache miss "calls" it (a canned verdict, no network);
// cache reads go through the real implementation.
const llmCalls = vi.hoisted(() => ({ n: 0 }));
vi.mock("@/app/lib/matcher/rerank", async (importOriginal) => {
  const real: any = await importOriginal();
  return {
    ...real,
    llmRerankEnabled: () => true,
    rerankForUser: async (opts: any) => {
      if (opts.useLLM === false) return real.rerankForUser(opts);
      llmCalls.n++;
      return new Map(opts.jobs.map((j: any) => [j._id, { _id: j._id, fit: 77, why: "fresh", gaps: [], cached: false }]));
    },
  };
});

import mongoose from "mongoose";
import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import MatchCache from "@/app/models/MatchCache";
import UsageCounter from "@/app/models/UsageCounter";
import { signJwt } from "@/app/lib/jwt";
import { embedAndStoreResume } from "@/app/lib/matcher/candidateProfile";
import { loadCandidateProfile } from "@/app/lib/matcher/hybrid";
import { GET as explainGET } from "@/app/api/matcher/explain/route";

setupTestDb();

const O = "http://localhost";
let dana = "", noResume = "", cachedJob = "", freshJob = "", resumeVersion = 0;
const explain = async (user: string, jobId: string) => explainGET(new NextRequest(`${O}/api/matcher/explain?jobId=${jobId}`, { headers: { cookie: `token=${await signJwt({ id: user })}` } }));
const used = async (user: string) => ((await UsageCounter.findOne({ userId: user, key: "explain" }).lean()) as any)?.n ?? 0;

beforeAll(async () => {
  await resetDb();
  process.env.QUOTA_ENFORCE_IN_TESTS = "1";
  const updated = new Date();
  dana = String((await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana", phone: "050", resumeText: "Junior React developer, TypeScript", resumeUpdatedAt: updated } as any))._id);
  noResume = String((await User.create({ username: "noa", email: "noa@test.dev", password: "x", fullname: "Noa", phone: "050" } as any))._id);
  await embedAndStoreResume(dana, "Junior React developer, TypeScript");
  // The cache key is whatever version the profile reports (embedding may touch resumeUpdatedAt).
  resumeVersion = (await loadCandidateProfile(dana))!.resumeVersion;
  const jobs = await ExternalJobs.create([
    { job: "Junior React Developer", company: "Acme", city: "Tel Aviv", country: "Israel", url: "u1", finalUrl: "u1", description: "React", skills: [], seniority: ["junior"], source: "greenhouse", sourceJobId: "q1" },
    { job: "Frontend Developer", company: "Globex", city: "Haifa", country: "Israel", url: "u2", finalUrl: "u2", description: "React", skills: [], seniority: [], source: "greenhouse", sourceJobId: "q2" },
  ] as any);
  cachedJob = String(jobs[0]._id);
  freshJob = String(jobs[1]._id);
  await MatchCache.create({ userId: dana, jobId: cachedJob, resumeVersion, fit: 88, why: "cached", gaps: [] });
});
afterAll(() => {
  delete process.env.QUOTA_ENFORCE_IN_TESTS;
});

describe("explain quota", () => {
  it("a cached verdict, a missing job and a missing résumé don't consume quota; a fresh rerank does", async () => {
    const hit = await (await explain(dana, cachedJob)).json();
    expect(hit).toMatchObject({ ready: true, fit: 88, why: "cached", reranked: true });
    expect((await explain(dana, String(new mongoose.Types.ObjectId()))).status).toBe(404);
    expect((await (await explain(noResume, cachedJob)).json()).reason).toBe("NO_RESUME");
    expect(await used(dana)).toBe(0);
    expect(await used(noResume)).toBe(0);
    expect(llmCalls.n).toBe(0);

    const miss = await (await explain(dana, freshJob)).json();
    expect(miss).toMatchObject({ fit: 77, why: "fresh" });
    expect(llmCalls.n).toBe(1);
    expect(await used(dana)).toBe(1);
  });

  it("when the day's cap is spent, cached verdicts still load and only a fresh rerank gets the 429", async () => {
    process.env.QUOTA_EXPLAIN = "1"; // already used 1 above
    try {
      expect((await explain(dana, cachedJob)).status).toBe(200);
      expect((await explain(dana, freshJob)).status).toBe(429);
      expect(llmCalls.n).toBe(1);
    } finally {
      delete process.env.QUOTA_EXPLAIN;
    }
  });
});
