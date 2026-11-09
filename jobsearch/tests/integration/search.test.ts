import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

// Signed-in searches score results against the user's résumé: use the fake embedder.
vi.mock("@/app/lib/matcher/embeddings", async () => import("../setup/fakeEmbedder"));

import ExternalJobs from "@/app/models/ExternalJobs";
import Job from "@/app/models/Job";
import Company from "@/app/models/Company";
import User from "@/app/models/User";
import mongoose from "mongoose";
import { signJwt, sessionClaims } from "@/app/lib/jwt";
import { embedPendingJobs } from "@/app/lib/matcher/embedJobs";
import { embedAndStoreResume } from "@/app/lib/matcher/candidateProfile";
import { GET as searchGET } from "@/app/api/jobs/search/route";
import { GET as facetsGET } from "@/app/api/jobs/facets/route";

setupTestDb();

const call = async (qs: string) => {
  const res = await searchGET(new NextRequest(`http://localhost/api/jobs/search?${qs}`));
  return { status: res.status, body: await res.json() };
};

const ext = (o: Partial<Record<string, unknown>>) => ({
  job: "Software Engineer", company: "Acme", city: "Tel Aviv", country: "IL",
  url: "https://x/" + Math.random(), finalUrl: "https://x/" + Math.random(),
  description: "", skills: [], seniority: [], source: "greenhouse",
  sourceJobId: String(Math.random()), postedAt: new Date(), ...o,
});

beforeAll(async () => {
  await resetDb();
  await ExternalJobs.insertMany([
    ext({ job: "Junior React Developer", company: "Inmanage", description: "React, TypeScript", postedAt: new Date("2026-10-07") }),
    ext({ job: "Senior Backend Engineer", company: "Google", description: "Go, Kubernetes", postedAt: new Date("2026-10-06") }),
    ext({ job: "Software Engineer", company: "Comeet Co", seniority: ["Entry-level"], description: "Python and React", postedAt: new Date("2026-10-05") }),
    ext({ job: "Data Scientist", company: "Google", city: "Haifa", description: "Python, ML", postedAt: new Date("2026-10-04") }),
    ext({ job: "DevOps Engineer", company: "Nice", city: "United Kingdom - Remote", country: "Unknown", description: "AWS", postedAt: new Date("2026-10-03") }),
    ext({ job: "QA Engineer", company: "Instacart", city: "Israel - Hybrid (3 days)", country: "Unknown", description: "testing", postedAt: new Date("2026-10-02") }),
    ext({ job: "מנתח/ת מערכות", company: "Aman", city: "ירושלים", country: "Israel", description: "ניתוח מערכות למשרד ממשלתי", postedAt: new Date("2026-10-01") }),
    ext({ job: "Software Engineering Intern", company: "Apple", city: "Herzliya", country: "Israel", description: "remote-friendly boilerplate", postedAt: new Date("2026-09-30") }),
  ]);
  const google = await Company.create({ companyName: "Google" } as any).catch(async () => Company.findOne({ companyName: "Google" }));
  await Job.create({ job: "Junior CRM Software Engineer", company: (google as any)._id, type: "Remote", city: "Tel-Aviv", country: "Israel", description: "Salesforce" } as any);
});

describe("GET /api/jobs/search", () => {
  it("searches the whole catalog, not a page", async () => {
    const { body } = await call("q=react");
    expect(body.externalTotal).toBe(2); // Junior React + "Python and React"
    expect(body.jobs.map((j: any) => j.job)).toContain("Junior React Developer");
  });

  it("requires every word of a multi-word query (AND), anywhere in the fields", async () => {
    const { body } = await call("q=junior%20react");
    expect(body.externalTotal).toBe(1);
    expect(body.jobs[0].job).toBe("Junior React Developer");
    const none = await call("q=junior%20kubernetes");
    expect(none.body.externalTotal).toBe(0);
  });

  it("filters seniority with the same buckets the UI labels", async () => {
    const junior = await call("seniority=Junior");
    // Junior React + Entry-level Software Engineer + internal Junior CRM
    expect(junior.body.externalTotal).toBe(2);
    expect(junior.body.internalTotal).toBe(1);
    const intern = await call("seniority=Intern");
    expect(intern.body.jobs.map((j: any) => j.job)).toEqual(["Software Engineering Intern"]);
    const senior = await call("seniority=Senior");
    expect(senior.body.jobs.map((j: any) => j.job)).toEqual(["Senior Backend Engineer"]);
  });

  it("partitions work mode from location fields only", async () => {
    const remote = await call("jobType=Remote");
    expect(remote.body.jobs.map((j: any) => j.job).sort()).toEqual(["DevOps Engineer", "Junior CRM Software Engineer"].sort());
    const hybrid = await call("jobType=Hybrid");
    expect(hybrid.body.jobs.map((j: any) => j.job)).toEqual(["QA Engineer"]);
    const onsite = await call("jobType=On%20Site");
    // "remote-friendly boilerplate" in a description must NOT make the intern Remote.
    expect(onsite.body.jobs.map((j: any) => j.job)).toContain("Software Engineering Intern");
    const all = await call("");
    expect(remote.body.externalTotal + hybrid.body.externalTotal + onsite.body.externalTotal).toBe(all.body.externalTotal);
  });

  it("resolves company filters for internal jobs via the Company name", async () => {
    const { body } = await call("company=Google");
    expect(body.externalTotal).toBe(2);
    expect(body.internalTotal).toBe(1);
    expect(body.jobs[0].source).toBe("internal");
    expect(body.jobs[0].company.companyName).toBe("Google");
  });

  it("paginates external jobs and returns internal ones only on page 1", async () => {
    const p1 = await call("limit=3&page=1");
    const p2 = await call("limit=3&page=2");
    expect(p1.body.pages).toBe(3); // 8 external / 3
    expect(p1.body.internalTotal).toBe(1);
    expect(p2.body.internalTotal).toBe(0);
    const ids1 = p1.body.jobs.map((j: any) => j._id);
    const ids2 = p2.body.jobs.map((j: any) => j._id);
    expect(ids1.some((id: string) => ids2.includes(id))).toBe(false);
    expect(p1.body.total).toBe(9);
  });

  it("clamps abusive limits and survives regex metacharacters", async () => {
    const big = await call("limit=100000");
    expect(big.body.jobs.length).toBeLessThanOrEqual(101);
    const weird = await call("q=%28%5B%2B%2A"); // "([+*"
    expect(weird.status).toBe(200);
    expect(weird.body.externalTotal).toBe(0);
    const long = await call("q=" + "a".repeat(5000));
    expect(long.status).toBe(200);
  });

  it("matches Hebrew text and city filters", async () => {
    const heb = await call("q=" + encodeURIComponent("מנתח מערכות"));
    expect(heb.body.jobs.map((j: any) => j.job)).toEqual(["מנתח/ת מערכות"]);
    const haifa = await call("city=Haifa");
    expect(haifa.body.jobs.map((j: any) => j.job)).toEqual(["Data Scientist"]);
  });

  it("posted=<days> keeps only recent postings: the employer's date, else when the Scout first saw it", async () => {
    const day = 86_400_000;
    await ExternalJobs.insertMany([
      ext({ job: "Zircon Engineer fresh", postedAt: new Date(Date.now() - 2 * day) }),
      ext({ job: "Zircon Engineer stale", postedAt: new Date(Date.now() - 40 * day), firstSeenAt: new Date(Date.now() - 40 * day) }),
      ext({ job: "Zircon Engineer undated", postedAt: null, firstSeenAt: new Date(Date.now() - 0.5 * day) }), // no ATS date → first seen counts
    ]);
    const titles = async (qs: string) => ((await (await searchGET(new NextRequest(`http://localhost/api/jobs/search?q=zircon${qs}`))).json()).jobs as any[]).map((j) => j.job).sort();
    expect(await titles("")).toEqual(["Zircon Engineer fresh", "Zircon Engineer stale", "Zircon Engineer undated"]);
    expect(await titles("&posted=7")).toEqual(["Zircon Engineer fresh", "Zircon Engineer undated"]);
    expect(await titles("&posted=1")).toEqual(["Zircon Engineer undated"]); // posted 2 days ago is out
    expect(await titles("&posted=99")).toHaveLength(3); // not one of the windows → ignored
    const body = await (await searchGET(new NextRequest("http://localhost/api/jobs/search?q=zircon&posted=7"))).json();
    expect(body.total).toBe(2); // the count honours the window too
  });

  it("exp= and tech= filter on the structured fields; 0-2 also admits junior titles without a stated number; facets list both", async () => {
    await ExternalJobs.insertMany([
      ext({ job: "Quartz Backend Developer", description: "Requirements:\n• 2+ years of experience with Python and Kafka", experienceMin: 2, tech: ["Python", "Kafka"], enrichedAt: new Date() }),
      ext({ job: "Quartz Senior Backend Developer", description: "6+ years of experience with Java", experienceMin: 6, tech: ["Java"], enrichedAt: new Date() }),
      ext({ job: "Quartz Junior QA Engineer", description: "Join us", enrichedAt: new Date() }), // no years stated, junior title
      ext({ job: "Quartz Account Executive", description: "Sales", enrichedAt: new Date() }),
    ]);
    const titles = async (qs: string) => ((await (await searchGET(new NextRequest(`http://localhost/api/jobs/search?q=quartz${qs}`))).json()).jobs as any[]).map((j) => j.job).sort();
    expect(await titles("&exp=0-2")).toEqual(["Quartz Backend Developer", "Quartz Junior QA Engineer"]);
    expect(await titles("&exp=5-10")).toEqual(["Quartz Senior Backend Developer"]);
    expect(await titles("&tech=Kafka")).toEqual(["Quartz Backend Developer"]);
    expect(await titles("&tech=Java,Kafka")).toEqual(["Quartz Backend Developer", "Quartz Senior Backend Developer"]);
    expect(await titles("&exp=0-2&tech=Java")).toEqual([]);
    const facets = await (await facetsGET()).json();
    expect(facets.tech).toEqual(expect.arrayContaining(["Python", "Kafka", "Java"]));
    expect(facets.experience.map((b: any) => b.key)).toEqual(["0-2", "3-5", "5-10", "10+"]);
    await ExternalJobs.deleteMany({ job: /^Quartz/ }); // the paging test below counts the whole fixture set
  });

  it("is not personalised without a session", async () => {
    const { body } = await call("q=react");
    expect(body.personalized).toBe(false);
    expect(body.jobs.every((j: any) => j.matchScore === undefined)).toBe(true);
  });

  it("scores and sorts results by résumé match for a signed-in user", async () => {
    await embedPendingJobs();
    const u = await User.create({ username: "fe", email: "fe@test.dev", password: "x", fullname: "FE", phone: "0" } as any);
    await embedAndStoreResume(String(u._id), "Junior frontend developer: React, TypeScript, web apps");
    const token = await signJwt({ id: String(u._id) });
    const res = await searchGET(new NextRequest("http://localhost/api/jobs/search?q=engineer", { headers: { cookie: `token=${token}` } }));
    const body = await res.json();
    expect(body.personalized).toBe(true);
    const ext = body.jobs.filter((j: any) => j.source === "external");
    expect(ext.length).toBeGreaterThan(1);
    for (const j of ext) {
      expect(Number.isInteger(j.matchScore)).toBe(true);
      expect(j.embedding).toBeUndefined(); // never leak vectors to the client
    }
    for (let i = 1; i < ext.length; i++) expect(ext[i - 1].matchScore).toBeGreaterThanOrEqual(ext[i].matchScore);
  });

  it("ignores a forged/invalid session cookie", async () => {
    const res = await searchGET(new NextRequest("http://localhost/api/jobs/search?q=react", { headers: { cookie: "token=not-a-jwt" } }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.personalized).toBe(false);
  });
});

describe("GET /api/jobs/facets", () => {
  it("lists DB-wide options without Unknown/empty values", async () => {
    const res = await facetsGET();
    const body = await res.json();
    expect(body.companies).toEqual([...body.companies].sort((a: string, b: string) => a.localeCompare(b)));
    expect(body.companies).toContain("Google");
    expect(body.companies).toContain("Aman");
    expect(body.countries).not.toContain("Unknown");
    expect(body.cities).toContain("Haifa");
    expect(body.seniority).toEqual(["Intern", "Junior", "Mid", "Senior"]);
  });

  it("list responses carry a description snippet and the right cache headers", async () => {
    const O = "http://localhost";
    const longDesc = "React ".repeat(400);
    await ExternalJobs.create({ job: "Snippet Test Engineer", company: "Snip", city: "Tel Aviv", country: "Israel", url: "snip", finalUrl: "snip", description: longDesc, skills: [], seniority: [], source: "greenhouse", sourceJobId: "snip", postedAt: new Date("2026-10-08") } as any);
    const anon = await searchGET(new NextRequest(`${O}/api/jobs/search?q=snippet`));
    expect(anon.headers.get("cache-control")).toMatch(/public/);
    const body = await anon.json();
    const j = body.jobs.find((x: any) => x.job === "Snippet Test Engineer");
    expect(j.description.length).toBeLessThan(500);
    expect(j.description.endsWith("…")).toBe(true);
    // Sessions are revocation-checked (the user must exist), so sign for a real user.
    const viewer = await User.create({ username: "snipviewer", email: "snipviewer@test.dev", password: "x", fullname: "Snip Viewer", phone: "0" } as any);
    const mine = await searchGET(new NextRequest(`${O}/api/jobs/search?q=snippet&me=1`, { headers: { cookie: `token=${await signJwt(sessionClaims(viewer as any))}` } }));
    expect(mine.headers.get("cache-control")).toMatch(/private/);
  });
});

describe("GET /api/external-jobs/fetch-all-external-jobs", () => {
  it("pages without repeating a job when many share the same sort keys", async () => {
    const { GET } = await import("@/app/api/external-jobs/fetch-all-external-jobs/route");
    const createdAt = new Date("2026-10-06T12:23:38.984Z");
    await ExternalJobs.insertMany(Array.from({ length: 30 }, (_, i) => ({ ...ext({ job: `Tied Engineer ${i}`, sourceJobId: `tie-${i}`, postedAt: undefined }), createdAt })));
    const page = async (p: number) => (await (await GET(new NextRequest(`http://localhost/api/external-jobs/fetch-all-external-jobs?page=${p}&limit=7`))).json()).jobs as any[];
    const ids: string[] = [];
    for (let p = 1; p <= 6; p++) ids.push(...(await page(p)).map((j) => String(j._id)));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(await ExternalJobs.countDocuments());
  });
});
