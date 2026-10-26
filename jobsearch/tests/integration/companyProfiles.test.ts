import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

const { fakeClient, counter } = vi.hoisted(() => {
  const counter = { calls: 0 };
  const fakeClient = {
    responses: {
      create: async (args: any) => {
        counter.calls++;
        const name = /company "([^"]+)"/.exec(String(args.input))?.[1] || "?";
        const body = { summary: `${name} מפתחת פלטפורמת ניהול עבודה לצוותים.`, industry: "SaaS לניהול עבודה", hq: "תל אביב, ישראל", founded: "2012", size: "1,000–5,000", website: `https://${name.toLowerCase()}.com`, sources: [`https://${name.toLowerCase()}.com/about`], confidence: "high" };
        if (args.tools) return { output_text: "Sure:\n" + JSON.stringify(body), output: [{ type: "web_search_call" }, { type: "message" }] };
        return { output_text: JSON.stringify(body), output: [{ type: "message" }] };
      },
    },
  };
  return { fakeClient, counter };
});
vi.mock("openai", () => ({ default: class { responses = fakeClient.responses; } }));

import ExternalJobs from "@/app/models/ExternalJobs";
import CompanyProfile from "@/app/models/CompanyProfile";
import { describeCompany, describeMissingCompanies, summaryFromAtsDescription, catalogCompanies, profilesFor } from "@/app/lib/companies/profiles";
import { GET as companiesGET } from "@/app/api/companies/route";
import { startFlow, processQueue, readRun } from "@/app/lib/agents";
import { invalidate } from "@/app/lib/cache";

setupTestDb();

const ext = (o: Record<string, unknown>) => ({ job: "Software Engineer", company: "Acme", city: "Tel Aviv", country: "IL", url: "https://x/" + Math.random(), finalUrl: "https://x/" + Math.random(), description: "", skills: [], seniority: [], source: "greenhouse", sourceJobId: String(Math.random()), postedAt: new Date(), ...o });

beforeAll(async () => {
  await resetDb();
  await ExternalJobs.insertMany([
    ext({ company: "Monday", companyDomain: "monday.com", job: "Frontend Developer" }),
    ext({ company: "Monday", companyDomain: "monday.com", job: "Backend Engineer" }),
    ext({ company: "Globex", company_description: "<p>Globex builds <b>industrial robots</b> for logistics warehouses. Founded in Haifa, we ship to 30 countries. Our team of 200 engineers loves hard problems.</p>" }),
    ext({ company: "Nobody Ltd" }),
  ]);
});

describe("company profiles", () => {
  it("describes a company from web search (Hebrew summary), caches for 60 days", async () => {
    const r = await describeCompany("Monday", { domain: "monday.com", sampleTitles: ["Frontend Developer"], client: fakeClient as any });
    expect(r).toMatchObject({ key: "monday", source: "web", confidence: "high", cached: false });
    expect(r!.summary).toMatch(/ניהול עבודה/);
    const again = await describeCompany("monday", { client: fakeClient as any });
    expect(again!.cached).toBe(true);
    expect(counter.calls).toBe(1);
    const doc: any = await CompanyProfile.findOne({ key: "monday" }).lean();
    expect(doc).toMatchObject({ industry: "SaaS לניהול עבודה", hq: "תל אביב, ישראל", founded: "2012" });
  });

  it("falls back to the ATS blurb without a client, and skips companies with nothing to say", async () => {
    expect(summaryFromAtsDescription("<p>Short.</p>")).toBe("");
    const companies = await catalogCompanies();
    expect(companies.map((c) => c.name)).toEqual(["Monday", "Globex", "Nobody Ltd"]); // by open roles
    const r = await describeMissingCompanies({ limit: 10 }); // no client under test
    expect(r).toMatchObject({ considered: 3, due: 2, described: 1, skipped: 1, failed: 0, names: ["Globex"] });
    const globex: any = await CompanyProfile.findOne({ key: "globex" }).lean();
    expect(globex.source).toBe("ats");
    expect(globex.summary).toBe("Globex builds industrial robots for logistics warehouses. Founded in Haifa, we ship to 30 countries. Our team of 200 engineers loves hard problems.");
    expect(summaryFromAtsDescription("We make widgets for the automotive industry and more. ".repeat(10))).toMatch(/\.$/); // long blurbs cut on a sentence
    expect(globex.summary).not.toMatch(/<|>/);
    expect(await CompanyProfile.countDocuments()).toBe(2);
    const again = await describeMissingCompanies({ limit: 10 });
    expect(again).toMatchObject({ due: 1, described: 0, skipped: 1 }); // Nobody Ltd stays due but has no blurb
  });

  it("the Companies API carries the summary and industry; names without a profile get empty strings", async () => {
    invalidate();
    const res = await companiesGET(new NextRequest("http://localhost/api/companies"));
    const body = await res.json();
    const monday = body.companies.find((c: any) => c.name === "Monday");
    expect(monday).toMatchObject({ industry: "SaaS לניהול עבודה", hq: "תל אביב, ישראל" });
    expect(monday.summary).toMatch(/ניהול עבודה/);
    expect(body.companies.find((c: any) => c.name === "Globex").summary).toMatch(/industrial robots/);
    expect(body.companies.find((c: any) => c.name === "Nobody Ltd")).toMatchObject({ summary: "", industry: "" });
    expect((await profilesFor(["Monday", "Unknown Co"])).size).toBe(1);
  });

  it("runs as the Researcher's cron flow on the bus", async () => {
    const { runId } = await startFlow("companies.describe", { limit: 5 }, { from: "cron", title: "Company profiles" });
    const r = await processQueue({ runId });
    expect(r.failed).toBe(0);
    const run = (await readRun(runId))!;
    expect(run.messages.map((m: any) => `${m.to}:${m.type}:${m.status}`)).toEqual(["researcher:companies.describe:done"]);
    expect(run.messages[0].result).toMatch(/Company profiles: 0 written, 1 without enough to say; 0 of 3 still waiting/);
  });
});
