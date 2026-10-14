import { describe, it, expect, beforeAll } from "vitest";
import { setupTestDb, resetDb } from "../setup/mongo";

import User from "@/app/models/User";
import Contact from "@/app/models/Contact";
import CompanySource from "@/app/models/CompanySource";
import ExternalJobs from "@/app/models/ExternalJobs";
import DiscoveryCandidate from "@/app/models/DiscoveryCandidate";
import { slugGuesses, probeSlug, collectCandidates, discoverCompanies, buildDiscoveryPrompt, setDiscoverDefaults } from "@/app/lib/scout/discover";
import { startFlow, processQueue, readRun } from "@/app/lib/agents";

setupTestDb();

// The public ATS APIs, scripted: only "moonactive" is a Greenhouse board, only "globex" is on Lever.
const hits: string[] = [];
const fakeFetch = async (url: string) => {
  hits.push(url);
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as any;
  const miss = () => ({ ok: false, status: 404, json: async () => ({}) }) as any;
  if (url === "https://boards-api.greenhouse.io/v1/boards/moonactive/jobs") return ok({ jobs: [{ id: 1 }, { id: 2 }, { id: 3 }] });
  if (url === "https://api.lever.co/v0/postings/globex?mode=json") return ok([{ id: "a" }]);
  return miss();
};
const noDetect = async () => null;
// Web search: a fake Responses client that "finds" Globex on Lever and a company with a bogus name.
const fakeClient = { responses: { create: async () => ({ output_text: JSON.stringify({ companies: [{ name: "Globex", careersUrl: "https://jobs.lever.co/globex", domain: "globex.com" }, { name: "", careersUrl: "x" }] }), output: [{ type: "web_search_call" }] }) } };

let dana = "";
beforeAll(async () => {
  await resetDb();
  setDiscoverDefaults({ fetchImpl: fakeFetch as any, detect: noDetect, client: null }); // the agent path must never reach the network
  dana = String((await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana", phone: "0" } as any))._id);
  await CompanySource.create({ companyName: "Wix", atsType: "comeet", identifier: "wix-uid", secondaryIdentifier: "tok", domain: "wix.com" } as any);
  await ExternalJobs.create({ job: "x", company: "monday.com", city: "Tel Aviv", country: "Israel", url: "u", finalUrl: "u", description: "", skills: [], seniority: [], source: "comeet", sourceJobId: "m1" } as any);
  await Contact.create([
    { userId: dana, fullName: "A", company: "Moon Active Ltd", companyKey: "moon active", dedupeKey: "a" },
    { userId: dana, fullName: "B", company: "Moon Active", companyKey: "moon active", dedupeKey: "b" },
    { userId: dana, fullName: "C", company: "Wix.com Ltd", companyKey: "wix", dedupeKey: "c" }, // already a source
    { userId: dana, fullName: "D", company: "monday.com", companyKey: "monday", dedupeKey: "d" }, // already has postings
    { userId: dana, fullName: "E", company: "Nobody Industries", companyKey: "nobody industries", dedupeKey: "e" },
  ] as any);
});

describe("company discovery", () => {
  it("guesses slugs the way ATS boards name them", () => {
    expect(slugGuesses("Moon Active Ltd")).toEqual(["moonactive", "moon-active", "moon", "moonactiveltd"]);
    expect(slugGuesses("monday.com")).toEqual(["monday", "mondaycom"]);
    expect(slugGuesses("Wix")).toEqual(["wix"]);
    expect(slugGuesses("")).toEqual([]);
    expect(buildDiscoveryPrompt("fintech")).toMatch(/Never invent URLs/);
  });

  it("probes the public ATS APIs for a slug and reports the board with postings", async () => {
    hits.length = 0;
    const tried: any[] = [];
    expect(await probeSlug("moonactive", fakeFetch as any, tried)).toMatchObject({ atsType: "greenhouse", identifier: "moonactive", jobs: 3, careersUrl: "https://boards.greenhouse.io/moonactive" });
    expect(tried).toHaveLength(1); // stops at the first hit
    expect(await probeSlug("nothing", fakeFetch as any)).toBeNull();
    expect(hits.filter((h) => h.includes("nothing"))).toHaveLength(6); // every ATS tried once
  });

  it("collects names from contacts and search, skipping companies already covered", async () => {
    const c = await collectCandidates({ client: fakeClient as any });
    expect(c).toMatchObject({ contacts: 2, insiders: 0, search: 1 }); // Moon Active + Nobody; Wix and monday are known; Globex from search
    const rows: any[] = await DiscoveryCandidate.find({}).sort({ key: 1 }).lean();
    expect(rows.map((r) => `${r.key}:${r.origin}`)).toEqual(["globex:search", "moon-active:contacts", "nobody-industries:contacts"]);
    expect(rows.find((r) => r.key === "globex").urlHints).toEqual(["https://jobs.lever.co/globex"]);
    const again = await collectCandidates({ client: fakeClient as any });
    expect(again).toMatchObject({ contacts: 0, search: 0 }); // remembered
  });

  it("probes the pending candidates, adds the hits as sources, remembers the misses", async () => {
    const r = await discoverCompanies({ limit: 10, search: false, fetchImpl: fakeFetch as any, detect: noDetect });
    expect(r.probed).toBe(3);
    expect(r.found.map((f) => `${f.name.replace(/ Ltd$/, "")}→${f.atsType}/${f.identifier}`).sort()).toEqual(["Globex→lever/globex", "Moon Active→greenhouse/moonactive"]); // either spelling from the contacts
    expect(r.notFound).toBe(1);
    const sources: any[] = await CompanySource.find({}).sort({ companyName: 1 }).lean();
    expect(sources.map((s) => `${s.companyName.replace(/ Ltd$/, "")}:${s.atsType}:${s.identifier}`)).toEqual(["Globex:lever:globex", "Moon Active:greenhouse:moonactive", "Wix:comeet:wix-uid"]);
    expect(sources.find((s) => s.companyName === "Globex").domain).toBe("globex.com");
    const nobody: any = await DiscoveryCandidate.findOne({ key: "nobody-industries" }).lean();
    expect(nobody).toMatchObject({ status: "pending", attempts: 1 });
    expect(nobody.tried.length).toBeGreaterThanOrEqual(6);
    // Found ones are done; a second pass probes only the miss again, and gives up after three tries.
    const r2 = await discoverCompanies({ limit: 10, search: false, fetchImpl: fakeFetch as any, detect: noDetect });
    expect(r2).toMatchObject({ probed: 1, notFound: 1 });
    await discoverCompanies({ limit: 10, search: false, fetchImpl: fakeFetch as any, detect: noDetect });
    expect(((await DiscoveryCandidate.findOne({ key: "nobody-industries" }).lean()) as any).status).toBe("not_found");
    expect(await DiscoveryCandidate.countDocuments({ status: "found" })).toBe(2);
  });

  it("runs as the Scout's flow and polls each new source right away", async () => {
    await Contact.create({ userId: dana, fullName: "F", company: "Initech", companyKey: "initech", dedupeKey: "f" } as any); // a genuinely new name ("Globex Technologies" would collapse onto the Globex we already found)
    const { runId } = await startFlow("catalog.discover", { limit: 5, search: false }, { from: "cron", title: "Company discovery" });
    const r = await processQueue({ runId, max: 1 }); // only the discovery message; the refresh it queues is not run here (it would hit the network)
    expect(r.failed).toBe(0);
    const run = (await readRun(runId))!;
    const types = run.messages.map((m: any) => `${m.from}→${m.to}:${m.type}:${m.status}`);
    expect(types[0]).toBe("cron→scout:catalog.discover:done");
    expect(run.messages[0].result).toMatch(/Discovery: 1 new names \(1 from contacts/);
    expect(run.messages[0].result).toMatch(/probed 1: 0 new sources/);
    expect(types).toHaveLength(1); // nothing found → no refresh queued
  });

  it("links a candidate whose board is already a source instead of renaming it, and stops probing near the deadline", async () => {
    // "MoonActive" is a different candidate key from "Moon Active", but its slug hits the board we already have.
    await Contact.create({ userId: dana, fullName: "G", company: "MoonActive", companyKey: "moonactive", dedupeKey: "g" } as any);
    await Contact.create({ userId: dana, fullName: "H", company: "Umbrella Corp", companyKey: "umbrella", dedupeKey: "h" } as any);
    const r = await discoverCompanies({ limit: 10, search: false, fetchImpl: fakeFetch as any, detect: noDetect });
    expect(r.exists).toBe(1);
    expect(r.found).toEqual([]);
    const c: any = await DiscoveryCandidate.findOne({ key: "moonactive" }).lean();
    expect(c.status).toBe("exists");
    expect(String(c.sourceId)).toBe(String((await CompanySource.findOne({ identifier: "moonactive" }))!._id));
    expect(((await CompanySource.findOne({ identifier: "moonactive" }).lean()) as any).companyName).toMatch(/^Moon Active/); // not renamed
    expect(await CompanySource.countDocuments()).toBe(3);
    // Out of time before the first probe: nothing probed, everything still pending.
    await Contact.create({ userId: dana, fullName: "I", company: "Stark Industries", companyKey: "stark", dedupeKey: "i" } as any);
    const late = await discoverCompanies({ limit: 10, search: false, fetchImpl: fakeFetch as any, detect: noDetect, deadline: Date.now() + 1000 });
    expect(late).toMatchObject({ probed: 0, stoppedEarly: true });
    expect(late.pending).toBeGreaterThanOrEqual(1);
  });
});
