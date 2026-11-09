import { describe, it, expect, beforeAll } from "vitest";
import { setupTestDb, resetDb } from "../setup/mongo";
import ExternalJobs from "@/app/models/ExternalJobs";
import CompanySource from "@/app/models/CompanySource";
import { roleHub, cityHub, topCities, isHubRole } from "@/app/lib/seo/hubs";
import { GET as statsGET } from "@/app/api/catalog/stats/route";

setupTestDb();

const job = (o: Record<string, unknown>) => ({ job: "x", company: "Acme", city: "Tel Aviv", country: "Israel", url: "https://x/" + Math.random(), finalUrl: "https://x/" + Math.random(), description: "", skills: [], seniority: [], source: "greenhouse", sourceJobId: String(Math.random()), ...o });

beforeAll(async () => {
  await resetDb();
  await CompanySource.create({ companyName: "Acme", atsType: "greenhouse", identifier: "acme", enabled: true, lastPolledAt: new Date() } as any);
  await ExternalJobs.insertMany([
    job({ job: "Backend Developer", experienceMin: 2, tech: ["Python", "Kafka"] }),
    job({ job: "Senior Backend Engineer (Go)", city: "Haifa", experienceMin: 6, tech: ["Go"] }),
    job({ job: "Node.js Developer", company: "Globex", experienceMin: 1, tech: ["Node.js", "Python"] }),
    job({ job: "Frontend Developer", tech: ["React"] }),
    job({ job: "QA Automation Engineer", city: "Haifa", remote: true }),
    job({ job: "Closed Backend Developer", active: false, closedAt: new Date() }),
  ]);
});

describe("hub pages", () => {
  it("a role hub counts and lists the family's open postings with cities and technologies", async () => {
    const h = await roleHub("backend");
    expect(h.total).toBe(3); // Backend, Senior Backend (Go), Node.js; the closed one is out, Frontend/QA are not backend
    expect(h.juniorCount).toBe(2); // experienceMin ≤ 2
    expect(h.companies).toBe(2);
    expect(h.jobs.map((j) => j.job)).toEqual(expect.arrayContaining(["Backend Developer", "Node.js Developer", "Senior Backend Engineer (Go)"]));
    expect(h.tech[0]).toEqual({ tech: "Python", n: 2 });
    expect(h.cities.map((c) => c.city)).toEqual(["Tel Aviv", "Haifa"]);
    expect(isHubRole("backend")).toBe(true);
    expect(isHubRole("ceo")).toBe(false);
  });

  it("a city hub is exact and case-insensitive; 'remote' lists remote postings; top cities are ranked", async () => {
    expect((await cityHub("haifa")).total).toBe(2);
    expect((await cityHub("Tel Aviv")).total).toBe(3);
    expect((await cityHub("remote")).jobs.map((j) => j.job)).toEqual(["QA Automation Engineer"]);
    expect(await topCities(5)).toEqual([{ city: "Tel Aviv", n: 3 }, { city: "Haifa", n: 2 }]);
  });

  it("the public stats route states the catalogue numbers", async () => {
    const s = await (await statsGET()).json();
    expect(s).toMatchObject({ jobs: 5, companies: 2, sources: 1, newLast24h: 5 });
    expect(s.lastPolledAt).toBeTruthy();
  });
});
