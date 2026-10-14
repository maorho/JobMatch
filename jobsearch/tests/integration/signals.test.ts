import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

vi.mock("@/app/lib/matcher/embeddings", async () => import("../setup/fakeEmbedder"));

import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import JobSignal from "@/app/models/JobSignal";
import { embedPendingJobs } from "@/app/lib/matcher/embedJobs";
import { embedAndStoreResume } from "@/app/lib/matcher/candidateProfile";
import { signJwt } from "@/app/lib/jwt";
import { setSignal, signalsFor, savedJobs, appliedIds } from "@/app/lib/jobs/signals";
import { rankForUser } from "@/app/lib/matcher/hybrid";
import { GET as sigGET, POST as sigPOST } from "@/app/api/jobs/signals/route";

setupTestDb();

const job = (title: string, description: string) => ({ job: title, company: "Acme", city: "Tel Aviv", country: "Israel", url: "https://x/" + title, finalUrl: "https://x/" + title, description, skills: [], seniority: [], source: "greenhouse", sourceJobId: title, postedAt: new Date() });
let dana = "", token = "", react = "", vue = "";
beforeAll(async () => {
  await resetDb();
  react = String((await ExternalJobs.create(job("Junior React Developer", "React TypeScript frontend")))._id);
  vue = String((await ExternalJobs.create(job("Junior Vue Developer", "Vue TypeScript frontend")))._id);
  await ExternalJobs.create(job("Data Scientist", "Python pandas ML"));
  await embedPendingJobs();
  dana = String((await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana", phone: "0" } as any))._id);
  await embedAndStoreResume(dana, "Junior frontend developer React TypeScript Vue");
  token = await signJwt({ id: dana });
});
const authed = (url: string, init: RequestInit = {}) => new NextRequest(`http://localhost${url}`, { ...init, headers: { cookie: `token=${token}`, "Content-Type": "application/json", ...(init.headers || {}) } } as any);

describe("saved / dismissed signals", () => {
  it("save and dismiss are exclusive, undoable, and carry the posting's title and score", async () => {
    expect(await setSignal(dana, { jobId: react, kind: "saved", on: true, matchScore: 85 })).toEqual({ saved: true, dismissed: false });
    expect(await setSignal(dana, { jobId: react, kind: "dismissed", on: true })).toEqual({ saved: false, dismissed: true }); // dismiss clears the save
    expect(await setSignal(dana, { jobId: react, kind: "dismissed", on: false })).toEqual({ saved: false, dismissed: false });
    expect(await setSignal(dana, { jobId: react, kind: "saved", on: true, matchScore: 85 })).toEqual({ saved: true, dismissed: false });
    const row: any = await JobSignal.findOne({ userId: dana, jobId: react }).lean();
    expect(row).toMatchObject({ kind: "saved", title: "Junior React Developer", company: "Acme", matchScore: 85 });
    expect(await setSignal(dana, { jobId: "nope", kind: "saved", on: true })).toEqual({ saved: false, dismissed: false });
  });

  it("a dismissed posting leaves the ranked feed (and its total); saved ones are listed with details", async () => {
    const before = await rankForUser(dana, { limit: 10, rerank: false });
    expect(before.jobs.map((j) => j._id)).toContain(vue);
    await setSignal(dana, { jobId: vue, kind: "dismissed", on: true });
    const after = await rankForUser(dana, { limit: 10, rerank: false });
    expect(after.jobs.map((j) => j._id)).not.toContain(vue);
    expect(after.total).toBe(before.total - 1);
    expect(await signalsFor(dana)).toEqual({ saved: [react], dismissed: [vue] });
    const saved = await savedJobs(dana);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ jobId: react, title: "Junior React Developer", company: "Acme", city: "Tel Aviv", gone: false, matchScore: 85 });
    await ExternalJobs.deleteOne({ _id: react }); // the janitor pruned it
    expect((await savedJobs(dana))[0]).toMatchObject({ gone: true, title: "Junior React Developer" });
  });

  it("the API", async () => {
    const g = await (await sigGET(authed("/api/jobs/signals"))).json();
    expect(g).toMatchObject({ saved: [react], dismissed: [vue] });
    const p = await (await sigPOST(authed("/api/jobs/signals", { method: "POST", body: JSON.stringify({ jobId: vue, kind: "dismissed", on: false }) }))).json();
    expect(p).toMatchObject({ ok: true, dismissed: false });
    expect((await sigPOST(authed("/api/jobs/signals", { method: "POST", body: JSON.stringify({ jobId: vue, kind: "meh" }) }))).status).toBe(400);
    const list = await (await sigGET(authed("/api/jobs/signals?list=saved"))).json();
    expect(list.jobs).toHaveLength(1);
    expect((await sigGET(new NextRequest("http://localhost/api/jobs/signals"))).status).toBe(401);
  });
});

describe("soft-closed postings", () => {
  it("leave the feed and the search, but the person's application and saved entry survive (gone/closed for the card)", async () => {
    const Candidates = (await import("@/app/models/Candidates")).default;
    const { GET: searchGET } = await import("@/app/api/jobs/search/route");
    const { loadJob } = await import("@/app/lib/jobs/loadJob");
    const ember = String((await ExternalJobs.create(job("Junior Ember Developer", "Ember TypeScript frontend")))._id);
    await embedPendingJobs();
    expect(await ExternalJobs.countDocuments({ _id: ember, embeddedAt: { $exists: true }, active: true })).toBe(1);
    await setSignal(dana, { jobId: ember, kind: "saved", on: true, matchScore: 70 });
    await Candidates.create({ candidateId: dana, jobId: ember, jobModel: "ExternalJobs", status: "HR Phone Interview" });
    expect((await rankForUser(dana, { limit: 20, rerank: false, includeApplied: true })).jobs.map((j) => j._id)).toContain(ember);
    expect((await (await searchGET(new NextRequest("http://localhost/api/jobs/search?q=ember"))).json()).jobs.map((j: any) => j._id)).toEqual([ember]);
    // What the Scout does when the posting leaves the ATS feed (and what the sweep does for stale ones).
    await ExternalJobs.updateOne({ _id: ember }, { $set: { active: false, closedAt: new Date() } });
    expect((await rankForUser(dana, { limit: 20, rerank: false, includeApplied: true })).jobs.map((j) => j._id)).not.toContain(ember);
    const s = await (await searchGET(new NextRequest("http://localhost/api/jobs/search?q=ember"))).json();
    expect(s.jobs).toEqual([]);
    expect(s.externalTotal).toBe(0);
    // Nothing of the person's was deleted, and the page still loads it as closed.
    expect(await Candidates.countDocuments({ candidateId: dana, jobId: ember })).toBe(1);
    const saved = (await savedJobs(dana)).find((j) => j.jobId === ember)!;
    expect(saved).toMatchObject({ gone: true, closed: true, title: "Junior Ember Developer" });
    expect(saved.closedAt).toBeTruthy();
    expect(await loadJob("external", ember)).toMatchObject({ active: false, job: "Junior Ember Developer" });
    await Candidates.deleteMany({ jobId: ember }); // keep the applied-ids expectations below exact
  });

  it("the unique (candidateId, jobId) index refuses a second application to the same posting", async () => {
    const Candidates = (await import("@/app/models/Candidates")).default;
    await Candidates.syncIndexes();
    const dup = { candidateId: dana, jobId: react, jobModel: "ExternalJobs", status: "Submitted Resume" };
    await Candidates.create(dup);
    await expect(Candidates.create(dup)).rejects.toMatchObject({ code: 11000 });
    await Candidates.deleteMany({ jobId: react });
  });
});

describe("applied postings", () => {
  it("leave the feed once the person applied, by hand or through the Applier", async () => {
    const Candidates = (await import("@/app/models/Candidates")).default;
    const AutoApplication = (await import("@/app/models/AutoApplication")).default;
    const angular = String((await ExternalJobs.create(job("Junior Angular Developer", "Angular TypeScript frontend")))._id);
    const svelte = String((await ExternalJobs.create(job("Junior Svelte Developer", "Svelte TypeScript frontend")))._id);
    await embedPendingJobs();
    const before = await rankForUser(dana, { limit: 10, rerank: false });
    expect(before.jobs.map((j) => j._id)).toEqual(expect.arrayContaining([angular, svelte]));
    await Candidates.create({ candidateId: dana, jobId: angular, jobModel: "ExternalJobs", status: "Submitted Resume" }); // "Did you apply? → Yes"
    await AutoApplication.create({ userId: dana, jobId: svelte, jobModel: "ExternalJobs", status: "submitted" }); // the Applier
    const after = await rankForUser(dana, { limit: 10, rerank: false });
    expect(after.jobs.map((j) => j._id)).not.toContain(angular);
    expect(after.jobs.map((j) => j._id)).not.toContain(svelte);
    expect(after.total).toBe(before.total - 2);
    expect([...(await appliedIds(dana))].sort()).toEqual([angular, svelte].sort());
  });
});
