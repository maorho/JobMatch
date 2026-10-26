import { describe, it, expect, beforeAll } from "vitest";
import { setupTestDb, resetDb } from "../setup/mongo";

process.env.APP_URL = "https://jobmatch.test";

import ExternalJobs from "@/app/models/ExternalJobs";
import Job from "@/app/models/Job";
import Company from "@/app/models/Company";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { jobPostingJsonLd, articleJsonLd, breadcrumbJsonLd, jobPageJsonLd } from "@/app/lib/seo/jsonld";
import { generateMetadata as jobPageMetadata } from "@/app/job/[source]/[id]/page";
import { excerpt, siteUrl } from "@/app/lib/seo/site";
import { loadJob } from "@/app/lib/jobs/loadJob";
import { ARTICLES } from "@/app/content/articles";

setupTestDb();

let ext = "", internal = "";
beforeAll(async () => {
  await resetDb();
  ext = String((await ExternalJobs.create({ job: "Junior React Developer", company: "Acme", city: "Tel Aviv", country: "Israel", url: "u", finalUrl: "u", description: "<p>Build the <b>console</b>.</p>\n• React\n• TypeScript", skills: [], seniority: [], source: "greenhouse", sourceJobId: "s1", companyDomain: "acme.com", postedAt: new Date("2026-10-01") } as any))._id);
  const co = await Company.create({ companyName: "Initech" } as any);
  internal = String((await Job.create({ job: "Backend Developer", company: co._id, type: "Remote", city: "Tel Aviv", country: "Israel" } as any))._id);
});

describe("robots + sitemap", () => {
  it("keeps account areas and the API out, points to the sitemap", () => {
    const r = robots();
    const rule: any = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule.allow).toBe("/");
    expect(rule.disallow).toEqual(expect.arrayContaining(["/api/", "/Dashboard", "/Settings", "/messages", "/AdminDashboard"]));
    expect(r.sitemap).toBe("https://jobmatch.test/sitemap.xml");
  });

  it("lists the static pages, every article and the jobs with absolute URLs", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`${siteUrl()}/`);
    expect(urls).toContain(`${siteUrl()}/Articels`);
    for (const a of ARTICLES) expect(urls).toContain(`${siteUrl()}/Articels/${a.slug}`);
    expect(urls).toContain(`${siteUrl()}/job/external/${ext}`);
    expect(urls).toContain(`${siteUrl()}/job/internal/${internal}`);
    expect(urls.every((u) => u.startsWith("https://jobmatch.test/"))).toBe(true);
  });
});

describe("structured data", () => {
  it("emits a valid JobPosting for external and internal jobs (no invented salary/validThrough)", async () => {
    const job = await loadJob("external", ext);
    const ld: any = jobPostingJsonLd({ ...job, _id: String(job._id), company: job.company });
    expect(ld["@type"]).toBe("JobPosting");
    expect(ld.title).toBe("Junior React Developer");
    expect(ld.datePosted).toBe("2026-10-01");
    expect(ld.hiringOrganization).toEqual({ "@type": "Organization", name: "Acme", sameAs: "https://acme.com" });
    expect(ld.jobLocation.address).toMatchObject({ addressLocality: "Tel Aviv", addressCountry: "Israel" });
    expect(ld.url).toBe(`https://jobmatch.test/job/external/${ext}`);
    expect(ld.baseSalary).toBeUndefined();
    expect(ld.validThrough).toBeUndefined();

    const ij = await loadJob("internal", internal);
    expect(ij.source).toBe("internal");
    expect(ij.company.companyName).toBe("Initech");
    const ild: any = jobPostingJsonLd({ ...ij, _id: String(ij._id), company: ij.company.companyName });
    expect(ild.jobLocationType).toBe("TELECOMMUTE");
    expect(ild.directApply).toBe(true);
    expect(ild.employmentType).toBe("FULL_TIME");
    expect(await loadJob("external", "nope")).toBeNull();
  });

  it("a closed job page is noindex (follow) and emits no JobPosting; an open one is indexable with one", async () => {
    const meta = (id: string) => jobPageMetadata({ params: Promise.resolve({ source: "external", id }) });
    expect((await meta(ext)).robots).toEqual({ index: true, follow: true });
    const open = await loadJob("external", ext);
    expect(jobPageJsonLd({ ...open, _id: String(open._id), company: open.company }).map((x: any) => x["@type"])).toEqual(["JobPosting", "BreadcrumbList"]);

    const closedId = String((await ExternalJobs.create({ job: "Old Role", company: "Acme", city: "Tel Aviv", country: "Israel", url: "u2", finalUrl: "u2", description: "gone", skills: [], seniority: [], source: "greenhouse", sourceJobId: "s-closed", active: false, closedAt: new Date("2026-10-10") } as any))._id);
    expect((await meta(closedId)).robots).toEqual({ index: false, follow: true });
    const closed = await loadJob("external", closedId);
    expect(closed.active).toBe(false);
    expect(jobPageJsonLd({ ...closed, _id: String(closed._id), company: closed.company }).map((x: any) => x["@type"])).toEqual(["BreadcrumbList"]);
  });

  it("builds article + breadcrumb data and clean description excerpts", () => {
    const a: any = articleJsonLd({ slug: "x", title: "T", excerpt: "E", date: "2026-10-01", tags: ["a", "b"] });
    expect(a.mainEntityOfPage).toBe("https://jobmatch.test/Articels/x");
    expect(a.inLanguage).toBe("he");
    const b: any = breadcrumbJsonLd([{ name: "Jobs", path: "/" }, { name: "X", path: "/x" }]);
    expect(b.itemListElement[1]).toMatchObject({ position: 2, item: "https://jobmatch.test/x" });
    expect(excerpt("<p>Build the <b>console</b>.</p>\n• React\n• TypeScript", 160)).toBe("Build the console . React TypeScript");
    expect(excerpt("word ".repeat(100), 60).length).toBeLessThanOrEqual(60);
  });
});
