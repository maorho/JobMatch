import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

delete process.env.OPENAI_API_KEY;
process.env.CRON_SECRET = "test-cron-secret";
vi.mock("@/app/lib/matcher/embeddings", async () => import("../setup/fakeEmbedder"));

import mongoose from "mongoose";
import ApplicationOutcome from "@/app/models/ApplicationOutcome";
import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import { signJwt } from "@/app/lib/jwt";
import { embedAndStoreResume } from "@/app/lib/matcher/candidateProfile";
import { embedPendingJobs } from "@/app/lib/matcher/embedJobs";
import { rankForUser } from "@/app/lib/matcher/hybrid";
import { featureVector, fitLogistic, predictLearned, auc, priorLikelihood, likelihoodFrom, trainLikelihood, loadModel, resetModelCache, interviewLikelihood, FEATURE_NAMES, SHRINK } from "@/app/lib/matcher/likelihood";
import { GET as statusGET, POST as trainPOST } from "@/app/api/matcher/likelihood/route";
import { GET as explainGET } from "@/app/api/matcher/explain/route";

setupTestDb();

const O = "http://localhost";
const cookie = async (id: string) => ({ cookie: `token=${await signJwt({ id })}` });

/** A deterministic synthetic market: the better the fit and level match, the likelier the interview. */
function synthOutcome(i: number) {
  const rnd = (k: number) => ((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1; // stable pseudo-random in [0,1)
  const score = Math.round(30 + 65 * rnd(1));
  const level = rnd(2) < 0.6 ? "junior" : rnd(2) < 0.85 ? "mid" : "senior";
  const jobSeniority = rnd(3) < 0.4 ? "junior" : rnd(3) < 0.8 ? "mid" : "senior";
  const hasReferral = rnd(4) < 0.15;
  const levelFit = level === jobSeniority ? 1 : level === "junior" && jobSeniority === "senior" ? 0.2 : 0.6;
  const p = 1 / (1 + Math.exp(-((score - 70) / 8 + 1.5 * (levelFit - 0.6) + (hasReferral ? 1.2 : 0) - 0.8)));
  const positive = rnd(5) < p;
  const reached = positive ? (rnd(6) < 0.7 ? "screen" : "interview") : "none";
  const outcome = positive ? (reached === "screen" ? "screen" : "interview") : rnd(7) < 0.5 ? "rejected" : "no_reply";
  return { score, level, jobSeniority, hasReferral, levelFit, outcome, reached };
}

let dana = "", reactJob = "";

beforeAll(async () => {
  await resetDb();
  dana = String((await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana", phone: "050", resumeStructured: [{ heading: "Header", items: [{ title: "Dana", contact: [], summary: "Junior React developer" }] }], resumeUpdatedAt: new Date() } as any))._id);
  await embedAndStoreResume(dana, "Junior React developer, TypeScript, Next.js");
  const jobs = await ExternalJobs.create([
    { job: "Junior React Developer", company: "Acme", city: "Tel Aviv", country: "Israel", url: "u1", finalUrl: "u1", description: "React TypeScript Next.js junior frontend", skills: ["React"], seniority: ["junior"], source: "greenhouse", sourceJobId: "r1", postedAt: new Date(), firstSeenAt: new Date() },
    { job: "Senior Go Engineer", company: "Globex", city: "Haifa", country: "Israel", url: "u2", finalUrl: "u2", description: "Go Kubernetes Kafka backend", skills: [], seniority: ["senior"], source: "greenhouse", sourceJobId: "g1", postedAt: new Date(), firstSeenAt: new Date() },
  ] as any);
  reactJob = String(jobs[0]._id);
  await embedPendingJobs(10);
});

describe("logistic regression core", () => {
  it("recovers a planted relationship and ranks by it (AUC)", () => {
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 300; i++) {
      const a = (i % 17) / 17;
      const b = (i % 7) / 7;
      X.push([a, b]);
      y.push(a * 2 - b > 0.6 ? 1 : 0);
    }
    const m = fitLogistic(X, y, { epochs: 300 });
    expect(m.weights[0]).toBeGreaterThan(0);
    expect(m.weights[1]).toBeLessThan(0);
    expect(auc(X.map((x) => predictLearned(m, x)), y)).toBeGreaterThan(0.95);
    expect(auc([0.1, 0.9], [1, 0])).toBe(0);
    expect(auc([0.5, 0.5], [1, 0])).toBe(0.5);
  });

  it("the prior grows with the match score and the feature vector is stable", () => {
    expect(priorLikelihood(40)).toBeLessThan(priorLikelihood(60));
    expect(priorLikelihood(60)).toBeLessThan(priorLikelihood(75));
    expect(priorLikelihood(90)).toBeGreaterThan(0.4);
    expect(priorLikelihood(90)).toBeLessThanOrEqual(0.5);
    expect(featureVector({})).toHaveLength(FEATURE_NAMES.length);
    expect(featureVector({ matchScore: 80, level: "junior", jobSeniority: "senior" })).toContain(1); // overqualified=0, levelJunior=1
    expect(featureVector({ level: "senior", jobSeniority: "junior" })[7]).toBe(1); // overqualified
    expect(likelihoodFrom(null, { matchScore: 85 })).toMatchObject({ basis: "prior", samples: 0 });
  });
});

describe("training on outcomes", () => {
  it("uses the prior until there are enough resolved outcomes", async () => {
    expect(await loadModel({ fresh: true })).toBeNull();
    const r = await trainLikelihood();
    expect(r.trained).toBe(false);
    const before = await interviewLikelihood({ matchScore: 85, level: "junior", jobSeniority: "junior" });
    expect(before.basis).toBe("prior");
    expect(before.pct).toBe(Math.round(priorLikelihood(85) * 100));
  });

  it("learns from 150 synthetic outcomes: fit and referrals raise the likelihood, overqualification lowers it", async () => {
    const rows = [];
    for (let i = 0; i < 150; i++) {
      const s = synthOutcome(i);
      rows.push({ userId: dana, applicationId: new mongoose.Types.ObjectId(), jobId: new mongoose.Types.ObjectId(), jobModel: "ExternalJobs", company: "C", companyKey: "c", title: "T", appliedAt: new Date(Date.now() - 30 * 86_400_000), features: { matchScore: s.score, cosine: s.score / 120, levelFit: s.levelFit, rerankFit: s.score, level: s.level, jobSeniority: s.jobSeniority, remote: false, postedAgeDays: 5, autoApplied: false, hasReferral: s.hasReferral, jobModel: "ExternalJobs" }, outcome: s.outcome, reached: s.reached, resolvedAt: new Date() });
    }
    await ApplicationOutcome.insertMany(rows);
    const report = await trainLikelihood();
    expect(report.trained).toBe(true);
    expect(report.samples).toBe(150);
    expect(report.positives).toBeGreaterThan(20);
    expect(report.auc).toBeGreaterThan(0.75);

    const model = (await loadModel({ fresh: true }))!;
    expect(model.samples).toBe(150);
    const w = Object.fromEntries(model.featureNames.map((n, i) => [n, model.weights[i]]));
    expect(w.score).toBeGreaterThan(0);
    expect(w.hasReferral).toBeGreaterThan(0);

    const strong = likelihoodFrom(model, { matchScore: 72, cosine: 0.6, levelFit: 1, rerankFit: 72, level: "junior", jobSeniority: "junior" });
    const weak = likelihoodFrom(model, { matchScore: 45, cosine: 0.35, levelFit: 0.2, rerankFit: 45, level: "junior", jobSeniority: "senior" });
    const referred = likelihoodFrom(model, { matchScore: 72, cosine: 0.6, levelFit: 1, rerankFit: 72, level: "junior", jobSeniority: "junior", hasReferral: true });
    expect(strong.pct).toBeGreaterThan(weak.pct);
    expect(referred.pct).toBeGreaterThanOrEqual(strong.pct);
    // Compare the unrounded learned probabilities so saturation can't hide the referral effect.
    expect(predictLearned(model, featureVector({ matchScore: 72, cosine: 0.6, levelFit: 1, rerankFit: 72, level: "junior", jobSeniority: "junior", hasReferral: true }))).toBeGreaterThan(predictLearned(model, featureVector({ matchScore: 72, cosine: 0.6, levelFit: 1, rerankFit: 72, level: "junior", jobSeniority: "junior" })));
    expect(strong.basis).toBe(150 / (150 + SHRINK) > 0.8 ? "learned" : "blended");
    expect(weak.pct).toBeGreaterThanOrEqual(1);
    expect(strong.pct).toBeLessThanOrEqual(95);
  });

  it("the ranked feed, the explain route and the status route carry the score", async () => {
    resetModelCache();
    const { jobs } = await rankForUser(dana, { limit: 5, rerank: false });
    expect(jobs.length).toBeGreaterThanOrEqual(2);
    for (const j of jobs) expect(j.likelihood?.pct).toBeGreaterThanOrEqual(1);
    const react = jobs.find((j) => j._id === reactJob)!;
    const go = jobs.find((j) => j.job === "Senior Go Engineer")!;
    expect(react.likelihood!.pct).toBeGreaterThan(go.likelihood!.pct);
    expect(react.likelihood!.samples).toBe(150);

    const ex = await (await explainGET(new NextRequest(`${O}/api/matcher/explain?jobId=${reactJob}`, { headers: await cookie(dana) }))).json();
    expect(ex.ready).toBe(true);
    expect(ex.likelihood.pct).toBeGreaterThanOrEqual(1);
    expect(ex.likelihood.samples).toBe(150);

    const st = await (await statusGET(new NextRequest(`${O}/api/matcher/likelihood`, { headers: await cookie(dana) }))).json();
    expect(st).toMatchObject({ active: true, samples: 150 });
    expect(st.weights.score).toBeGreaterThan(0);
    expect((await trainPOST(new NextRequest(`${O}/api/matcher/likelihood`, { method: "POST", headers: await cookie(dana) }))).status).toBe(401);
    const retrain = await (await trainPOST(new NextRequest(`${O}/api/matcher/likelihood?cron_secret=test-cron-secret`, { method: "POST" }))).json();
    expect(retrain.trained).toBe(true);
  });
});
