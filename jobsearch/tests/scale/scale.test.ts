import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

vi.mock("@/app/lib/matcher/embeddings", async () => import("../setup/fakeEmbedder"));

import ExternalJobs from "@/app/models/ExternalJobs";
import { GET as searchGET } from "@/app/api/jobs/search/route";
import { GET as facetsGET } from "@/app/api/jobs/facets/route";
import { matchByVector } from "@/app/lib/matcher/matchCandidate";
import { fakeEmbed } from "../setup/fakeEmbedder";

/**
 * Scaling characterisation at ~10× today's catalog (50k postings). Run on
 * demand: `npm run test:scale`. Budgets are deliberately generous — they
 * catch pathological regressions (full scans turning quadratic, unbounded
 * payloads), not micro-performance.
 */
setupTestDb();

const N = 50_000;
const EMBEDDED = 20_000;
const TITLES = ["Software Engineer", "Junior React Developer", "Senior Backend Engineer", "Data Scientist", "DevOps Engineer", "QA Engineer", "Product Manager", "מפתח/ת Full Stack"];
const CITIES = ["Tel Aviv", "Haifa", "Jerusalem", "Herzliya", "Remote", "Beer Sheva"];
const COMPANIES = Array.from({ length: 300 }, (_, i) => `Company ${i}`);

const timed = async <T,>(label: string, fn: () => Promise<T>): Promise<[T, number]> => {
  const t = performance.now();
  const out = await fn();
  const ms = Math.round(performance.now() - t);
  console.log(`⏱ ${label}: ${ms} ms`);
  return [out, ms];
};

beforeAll(async () => {
  await resetDb();
  const [, ms] = await timed(`insert ${N} jobs`, async () => {
    for (let start = 0; start < N; start += 5000) {
      const batch = Array.from({ length: Math.min(5000, N - start) }, (_, k) => {
        const i = start + k;
        const title = TITLES[i % TITLES.length];
        const desc = `${title} role. React Python Kubernetes keywords ${i % 97}. ` + "lorem ipsum ".repeat(20);
        return {
          job: title, company: COMPANIES[i % COMPANIES.length], city: CITIES[i % CITIES.length], country: "IL",
          url: `https://x/${i}`, finalUrl: `https://x/${i}`, description: desc, skills: [], seniority: [],
          source: "greenhouse", sourceJobId: `s-${i}`, postedAt: new Date(Date.now() - i * 1000), lastSeenAt: new Date(),
          ...(i < EMBEDDED ? { embedding: fakeEmbed(desc) } : {}),
        };
      });
      await ExternalJobs.insertMany(batch, { ordered: false });
    }
  });
  expect(await ExternalJobs.countDocuments()).toBe(N);
  expect(ms).toBeLessThan(120_000);
}, 300_000);

const search = (qs: string) => searchGET(new NextRequest(`http://localhost/api/jobs/search?${qs}`)).then((r) => r.json());

describe(`search at ${N} postings`, () => {
  it("full-text query stays interactive and counts the whole catalog", async () => {
    const [body, ms] = await timed("search q=react", () => search("q=react&limit=48"));
    expect(body.externalTotal).toBe(N); // every description mentions React
    expect(body.jobs).toHaveLength(48);
    expect(ms).toBeLessThan(5000);
  });

  it("selective multi-word + filters narrow correctly", async () => {
    const [body, ms] = await timed("search q=junior react city=Haifa", () => search("q=junior%20react&city=Haifa&limit=48"));
    expect(body.externalTotal).toBeGreaterThan(0);
    expect(body.jobs.every((j: any) => j.city === "Haifa")).toBe(true);
    expect(ms).toBeLessThan(5000);
  });

  it("deep pagination returns a distinct page with a bounded payload", async () => {
    const [body, ms] = await timed("search page=900", () => search("limit=48&page=900"));
    expect(body.page).toBe(900);
    expect(body.jobs.length).toBe(48);
    expect(JSON.stringify(body).length).toBeLessThan(2_000_000);
    expect(ms).toBeLessThan(5000);
  });

  it("seniority bucket filter (regex $or/$not) stays bounded", async () => {
    const [body, ms] = await timed("search seniority=Junior", () => search("seniority=Junior&limit=48"));
    expect(body.externalTotal).toBe(N / TITLES.length); // exactly the "Junior React Developer" share
    expect(ms).toBeLessThan(8000);
  });

  it("facets over 300 companies and 6 cities", async () => {
    const [body, ms] = await timed("facets", () => facetsGET().then((r) => r.json()));
    expect(body.companies).toHaveLength(300);
    expect(body.cities).toHaveLength(CITIES.filter((c) => c !== "Remote").length); // "Remote" is a work mode, not a city facet
    expect(ms).toBeLessThan(5000);
  });
});

describe(`matching at ${EMBEDDED} embedded postings`, () => {
  it("ranks against every embedded job within budget and caps the working set", async () => {
    const vec = fakeEmbed("Junior React Developer role React keywords");
    const [top, ms] = await timed("matchByVector top 48", () => matchByVector(vec, { limit: 48 }));
    expect(top).toHaveLength(48);
    expect(top[0].job).toBe("Junior React Developer");
    expect(ms).toBeLessThan(8000);
  });
});
