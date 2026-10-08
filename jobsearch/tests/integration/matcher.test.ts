import { describe, it, expect, beforeAll, vi } from "vitest";
import { setupTestDb, resetDb } from "../setup/mongo";

// Replace OpenAI with the deterministic bag-of-words embedder for the whole file.
vi.mock("@/app/lib/matcher/embeddings", async () => import("../setup/fakeEmbedder"));

import ExternalJobs from "@/app/models/ExternalJobs";
import User from "@/app/models/User";
import { embedPendingJobs } from "@/app/lib/matcher/embedJobs";
import { embedAndStoreResume, getCandidateVector } from "@/app/lib/matcher/candidateProfile";
import { matchForUser, matchByText, matchByVector } from "@/app/lib/matcher/matchCandidate";
import { DIM } from "../setup/fakeEmbedder";

setupTestDb();

const job = (title: string, description: string, extra: object = {}) => ({
  job: title, company: "Acme", city: "Tel Aviv", country: "IL", url: "https://x/" + title, finalUrl: "https://x/" + title,
  description, skills: [], seniority: [], source: "greenhouse", sourceJobId: title, postedAt: new Date(), ...extra,
});

let n = 0;
const mkUser = async (resumeText: string, memory: object = {}) => {
  n++;
  const u = await User.create({
    username: `u${n}`, email: `u${n}@test.dev`, password: "x", fullname: `User ${n}`, phone: "050", memory,
  } as any);
  await embedAndStoreResume(String(u._id), resumeText);
  return String(u._id);
};

const RESUMES = {
  frontend: "Junior frontend developer. React, TypeScript, Next.js, CSS, Tailwind. Built web apps with React hooks and REST APIs.",
  data: "Data scientist. Python, pandas, scikit-learn, machine learning, ML models, statistics, SQL.",
  devops: "DevOps engineer. Kubernetes, AWS, Terraform, CI/CD, Docker, infrastructure, monitoring.",
  hebrew: "מפתח/ת Full Stack ג'וניור, React Node TypeScript, ניסיון בפיתוח web",
};

beforeAll(async () => {
  await resetDb();
  await ExternalJobs.insertMany([
    job("Junior React Developer", "React TypeScript Next.js frontend web developer CSS hooks REST"),
    job("Data Scientist", "Python pandas scikit-learn machine learning ML statistics SQL models"),
    job("DevOps Engineer", "Kubernetes AWS Terraform CI/CD Docker infrastructure monitoring"),
    job("Backend Engineer", "Go Postgres gRPC distributed systems"),
    job("Full Stack Developer", "React Node TypeScript web full stack"),
  ]);
  const r = await embedPendingJobs();
  expect(r.processed).toBe(5);
  expect(r.remaining).toBe(0);
});

describe("résumé → job matching (different candidates)", () => {
  it("ranks the matching domain first for each résumé", async () => {
    const fe = await matchForUser(await mkUser(RESUMES.frontend), { limit: 5 });
    expect(fe[0].job).toBe("Junior React Developer");
    const ds = await matchForUser(await mkUser(RESUMES.data), { limit: 5 });
    expect(ds[0].job).toBe("Data Scientist");
    const ops = await matchForUser(await mkUser(RESUMES.devops), { limit: 5 });
    expect(ops[0].job).toBe("DevOps Engineer");
  });

  it("handles a Hebrew résumé (ranks the web/full-stack roles on top)", async () => {
    const he = await matchForUser(await mkUser(RESUMES.hebrew), { limit: 2 });
    expect(["Full Stack Developer", "Junior React Developer"]).toContain(he[0].job);
  });

  it("returns 0–100 integer scores sorted by similarity, with stable pagination", async () => {
    const id = await mkUser(RESUMES.frontend);
    const all = await matchForUser(id, { limit: 10 });
    expect(all).toHaveLength(5);
    for (const m of all) {
      expect(Number.isInteger(m.matchScore)).toBe(true);
      expect(m.matchScore).toBeGreaterThanOrEqual(0);
      expect(m.matchScore).toBeLessThanOrEqual(100);
    }
    for (let i = 1; i < all.length; i++) expect(all[i - 1].cosine).toBeGreaterThanOrEqual(all[i].cosine);
    const page2 = await matchForUser(id, { limit: 2, skip: 2 });
    expect(page2.map((m) => m._id)).toEqual(all.slice(2, 4).map((m) => m._id));
    const strict = await matchForUser(id, { limit: 10, minScore: 101 });
    expect(strict).toEqual([]);
  });

  it("is deterministic: the same résumé twice gives the same ranking and a cached vector", async () => {
    const a = await mkUser(RESUMES.data);
    const b = await mkUser(RESUMES.data);
    const ra = (await matchForUser(a, { limit: 5 })).map((m) => m.job);
    const rb = (await matchForUser(b, { limit: 5 })).map((m) => m.job);
    expect(ra).toEqual(rb);
    const v1 = await getCandidateVector(a);
    const v2 = await getCandidateVector(a);
    expect(v1).toEqual(v2);
    expect(v1).toHaveLength(DIM);
  });

  it("uses profile memory (skills/experience) when there is no résumé", async () => {
    const id = await mkUser("", { skills: ["Kubernetes", "Terraform"], experience: ["DevOps at Acme"] });
    const m = await matchForUser(id, { limit: 1 });
    expect(m[0].job).toBe("DevOps Engineer");
  });
});

describe("edge cases", () => {
  it("has nothing to match for an empty résumé and empty profile", async () => {
    n++;
    const u = await User.create({ username: `e${n}`, email: `e${n}@test.dev`, password: "x", fullname: "Empty", phone: "0" } as any);
    expect(await embedAndStoreResume(String(u._id), "   ")).toBeNull();
    expect(await getCandidateVector(String(u._id))).toBeNull();
    expect(await matchForUser(String(u._id))).toEqual([]);
  });

  it("returns null for an unknown user and [] for an empty vector", async () => {
    expect(await getCandidateVector("64b000000000000000000000")).toBeNull();
    expect(await matchByVector([], { limit: 5 })).toEqual([]);
    expect(await matchByText("   ")).toEqual([]);
  });

  it("copes with a huge résumé (truncated, never crashes) and stores at most 20k chars", async () => {
    const huge = ("React TypeScript frontend web ").repeat(5000); // ~150k chars
    const id = await mkUser(huge);
    const m = await matchForUser(id, { limit: 1 });
    expect(m[0].job).toBe("Junior React Developer");
    const u = await User.findById(id).select("+resumeText");
    expect((u as any).resumeText.length).toBeLessThanOrEqual(20000);
  });

  it("ignores jobs without embeddings and new jobs get embedded on the next run", async () => {
    await ExternalJobs.create(job("Mobile Developer", "Kotlin Android iOS Swift"));
    const before = await matchForUser(await mkUser("Kotlin Android developer"), { limit: 1 });
    expect(before[0].job).not.toBe("Mobile Developer"); // not embedded yet
    const r = await embedPendingJobs();
    expect(r.processed).toBe(1);
    const after = await matchForUser(await mkUser("Kotlin Android developer"), { limit: 1 });
    expect(after[0].job).toBe("Mobile Developer");
  });
});
