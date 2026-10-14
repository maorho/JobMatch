import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupTestDb, resetDb } from "../setup/mongo";
import CompanySource from "@/app/models/CompanySource";
import ExternalJobs from "@/app/models/ExternalJobs";
import Candidates from "@/app/models/Candidates";
import { runScout } from "@/app/lib/scout/runScout";
import { sweepStaleExternalJobs } from "@/app/lib/staleJobsSweep";

setupTestDb();

/** Greenhouse board fixture, mutable so tests can "close" a posting. */
let board: Record<string, any[]> = {};
function stubGreenhouse() {
  vi.stubGlobal("fetch", vi.fn(async (input: any) => {
    const url = typeof input === "string" ? input : input.url;
    const m = url.match(/boards\/([^/]+)\/jobs/);
    const slug = m ? decodeURIComponent(m[1]) : "";
    if (!(slug in board)) return { ok: false, status: 404, text: async () => "", json: async () => ({}) } as any;
    return { ok: true, status: 200, text: async () => "", json: async () => ({ jobs: board[slug] }) } as any;
  }));
}
const gh = (id: number, title: string, location: string) => ({ id, title, location: { name: location }, content: "<p>desc</p>", absolute_url: `https://boards.greenhouse.io/x/jobs/${id}`, first_published: "2026-10-01T00:00:00Z" });

beforeEach(async () => {
  await resetDb();
  board = {
    acme: [gh(1, "Backend Engineer", "Tel Aviv, Israel"), gh(2, "Remote SRE", "Remote - USA"), gh(3, "Sales Rep", "New York, US")],
    globex: [gh(10, "Frontend Developer", "Haifa, Israel")],
  };
  stubGreenhouse();
  await CompanySource.create([
    { companyName: "Acme", atsType: "greenhouse", identifier: "acme", domain: "acme.com", enabled: true },
    { companyName: "Globex", atsType: "greenhouse", identifier: "globex", domain: "globex.com", enabled: true },
    { companyName: "Disabled", atsType: "greenhouse", identifier: "off", domain: "off.com", enabled: false },
  ] as any);
});
afterEach(() => vi.unstubAllGlobals());

describe("runScout ingestion", () => {
  it("ingests only Israel/remote postings, with company domain + logo, and dedups on re-run", async () => {
    const r1 = await runScout();
    expect(r1.sources).toBe(2); // disabled source skipped
    expect(r1.created).toBe(3); // Tel Aviv + Remote + Haifa; New York dropped
    const docs = await ExternalJobs.find({}).lean();
    expect(docs.map((d: any) => d.job).sort()).toEqual(["Backend Engineer", "Frontend Developer", "Remote SRE"]);
    const acme = docs.find((d: any) => d.job === "Backend Engineer") as any;
    expect(acme.company).toBe("Acme");
    expect(acme.companyDomain).toBe("acme.com");
    expect(acme.logoUrl).toContain("acme.com");
    expect(acme.lastSeenAt).toBeInstanceOf(Date);

    const r2 = await runScout();
    expect(r2.created).toBe(0);
    expect(await ExternalJobs.countDocuments()).toBe(3);
  });

  it("dry runs write nothing", async () => {
    const r = await runScout({ dry: true });
    expect(r.created).toBe(3);
    expect(await ExternalJobs.countDocuments()).toBe(0);
  });

  it("records a source error without stopping the others", async () => {
    delete board.acme; // 404
    const r = await runScout();
    const acme = r.results.find((x) => x.company === "Acme")!;
    expect(acme.error).toMatch(/HTTP 404/);
    expect(r.created).toBe(1); // Globex still ingested
    const src = await CompanySource.findOne({ identifier: "acme" }).lean();
    expect((src as any).lastError).toMatch(/404/);
  });
});

describe("runScout freshness (reconciliation)", () => {
  it("soft-closes a posting that left a complete feed (row + applications kept) and refreshes lastSeenAt on the rest", async () => {
    await runScout();
    const before = (await ExternalJobs.findOne({ job: "Remote SRE" }).lean()) as any;
    const sre = await ExternalJobs.findOne({ job: "Backend Engineer" });
    await Candidates.create({ jobModel: "ExternalJobs", jobId: sre!._id, candidateId: sre!._id, status: "Submitted Resume" } as any);

    board.acme = board.acme.filter((j) => j.id !== 1); // Backend Engineer closed
    await new Promise((r) => setTimeout(r, 5));
    const r = await runScout();
    expect(r.removed).toBe(1);
    const closed: any = await ExternalJobs.findOne({ job: "Backend Engineer" }).lean();
    expect(closed).not.toBeNull(); // never deleted: the person who applied keeps their history
    expect(closed.active).toBe(false);
    expect(closed.closedAt).toBeInstanceOf(Date);
    expect(await Candidates.countDocuments()).toBe(1); // no cascade
    const after = (await ExternalJobs.findOne({ job: "Remote SRE" }).lean()) as any;
    expect(after.lastSeenAt.getTime()).toBeGreaterThan(before.lastSeenAt.getTime());

    // Still gone next poll: not counted as closed twice.
    const r2 = await runScout();
    expect(r2.removed).toBe(0);
  });

  it("reopens a closed posting that comes back instead of creating a duplicate", async () => {
    await runScout();
    const gone = board.acme.find((j) => j.id === 1)!;
    board.acme = board.acme.filter((j) => j.id !== 1);
    await runScout();
    expect(((await ExternalJobs.findOne({ job: "Backend Engineer" }).lean()) as any).active).toBe(false);

    board.acme.push(gone); // reposted
    const r = await runScout();
    expect(r.created).toBe(0);
    expect(r.results.find((x) => x.company === "Acme")!.reopened).toBe(1);
    const back: any = await ExternalJobs.findOne({ job: "Backend Engineer" }).lean();
    expect(back.active).toBe(true);
    expect(back.closedAt).toBeUndefined();
    expect(await ExternalJobs.countDocuments({ job: "Backend Engineer" })).toBe(1);
  });

  it("never wipes a company on a transient empty fetch", async () => {
    await runScout();
    board.acme = []; // ATS glitch: 200 with no jobs
    const r = await runScout();
    expect(r.removed).toBe(0);
    expect(await ExternalJobs.countDocuments({ company: "Acme", active: true })).toBe(2);
  });

  it("a source past its deadline is an error — nothing is ingested or closed for it, the others continue", async () => {
    await runScout();
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: any, init: any) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/acme/")) await new Promise((r) => setTimeout(r, 200)); // Acme hangs
      return (realFetch as any)(input, init);
    }));
    board.acme = board.acme.filter((j) => j.id !== 1); // would close Backend Engineer if the fetch finished
    const r = await runScout({ sourceDeadlineMs: 50 });
    const acme = r.results.find((x) => x.company === "Acme")!;
    expect(acme.error).toMatch(/deadline/);
    expect(acme.removed).toBe(0);
    expect(((await ExternalJobs.findOne({ job: "Backend Engineer" }).lean()) as any).active).toBe(true); // no partial reconciliation
    expect(r.results.find((x) => x.company === "Globex")!.error).toBeUndefined();
  });

  it("refresh rewrites text but keeps a location the Locator already cleaned unless the raw string changed", async () => {
    await runScout();
    // The Locator (LLM stage) decided this is Tel Aviv-Yafo / Israel; the raw string is unchanged.
    await ExternalJobs.updateOne({ job: "Backend Engineer" }, { $set: { city: "Tel Aviv-Yafo", country: "Israel" } });
    board.acme.find((j) => j.id === 1)!.title = "Backend Engineer (Go)";
    board.acme.find((j) => j.id === 2)!.location.name = "Remote - Canada"; // raw location changed
    await runScout({ refresh: true });
    const be: any = await ExternalJobs.findOne({ sourceJobId: "1" }).lean();
    expect(be.job).toBe("Backend Engineer (Go)");
    expect(be.city).toBe("Tel Aviv-Yafo"); // kept
    const sre: any = await ExternalJobs.findOne({ sourceJobId: "2" }).lean();
    expect(sre.rawLocation).toMatch(/Canada/); // rewritten
  });
});

describe("runScout chunking for serverless", () => {
  it("walks the catalog in stable chunks via nextOffset", async () => {
    const c1 = await runScout({ offset: 0, limit: 1 });
    expect(c1.totalSources).toBe(2);
    expect(c1.processed).toBe(1);
    expect(c1.nextOffset).toBe(1);
    const c2 = await runScout({ offset: c1.nextOffset!, limit: 1 });
    expect(c2.processed).toBe(1);
    expect(c2.nextOffset).toBeNull();
    expect(await ExternalJobs.countDocuments()).toBe(3);
    const names = [...c1.results, ...c2.results].map((r) => r.company).sort();
    expect(names).toEqual(["Acme", "Globex"]);
  });

  it("always makes progress even with a zero time budget", async () => {
    const r = await runScout({ timeBudgetMs: 0 });
    expect(r.processed).toBe(1);
    expect(r.nextOffset).toBe(1);
  });

  it("an offset past the end is a no-op that reports done", async () => {
    const r = await runScout({ offset: 50 });
    expect(r.processed).toBe(0);
    expect(r.nextOffset).toBeNull();
  });
});

describe("sweepStaleExternalJobs (backstop)", () => {
  it("soft-closes ATS jobs unseen for the window, keeps applications, CSV and fresh jobs", async () => {
    await runScout();
    const old = new Date(Date.now() - 20 * 24 * 3600 * 1000);
    const stale = await ExternalJobs.findOne({ job: "Remote SRE" });
    await ExternalJobs.updateOne({ _id: stale!._id }, { $set: { lastSeenAt: old } });
    await Candidates.create({ jobModel: "ExternalJobs", jobId: stale!._id, candidateId: stale!._id } as any);
    // Legacy ATS doc without lastSeenAt but old ingestion time → swept too.
    await ExternalJobs.collection.insertOne({ job: "Legacy", company: "Old", country: "IL", url: "u", finalUrl: "f", skills: [], seniority: [], sourceJobId: "legacy-1", firstSeenAt: old, createdAt: old } as any);
    // CSV/manual job (no sourceJobId) is never ATS-managed → untouched.
    await ExternalJobs.collection.insertOne({ job: "CSV job", company: "Manual", country: "IL", url: "u2", finalUrl: "f2", skills: [], seniority: [], lastSeenAt: old, createdAt: old } as any);

    const r = await sweepStaleExternalJobs(14);
    expect(r.closed).toBe(2);
    expect(r.deleted).toBe(0);
    expect(r.applicationsDeleted).toBe(0);
    // Closed, not gone: the rows stay (applications still resolve them), flagged inactive with a timestamp.
    const sre: any = await ExternalJobs.findOne({ job: "Remote SRE" }).lean();
    expect(sre).toMatchObject({ active: false });
    expect(sre.closedAt).toBeInstanceOf(Date);
    expect((await ExternalJobs.findOne({ job: "Legacy" }).lean()) as any).toMatchObject({ active: false });
    expect(await Candidates.countDocuments({ jobId: stale!._id })).toBe(1);
    expect(((await ExternalJobs.findOne({ job: "CSV job" }).lean()) as any).active).not.toBe(false);
    expect(await ExternalJobs.countDocuments({ job: { $in: ["Backend Engineer", "Frontend Developer"] }, active: { $ne: false } })).toBe(2);
    // Idempotent: a second pass finds nothing open to close.
    expect((await sweepStaleExternalJobs(14)).closed).toBe(0);
  });
});
