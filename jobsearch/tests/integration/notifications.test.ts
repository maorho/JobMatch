import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";
import User from "@/app/models/User";
import Job from "@/app/models/Job";
import Company from "@/app/models/Company";
import Candidates from "@/app/models/Candidates";
import ExternalJobs from "@/app/models/ExternalJobs";
import Notification from "@/app/models/Notification";
import { signJwt } from "@/app/lib/jwt";
import { notify, unreadCount } from "@/app/lib/notifications/notify";
import { GET as listGET } from "@/app/api/notifications/route";
import { POST as readPOST } from "@/app/api/notifications/read/route";
import { GET as digestGET } from "@/app/api/notifications/job-matches/route";
import { PUT as changeStatusPUT } from "@/app/api/jobsDashboard/Recruiter/changeStatus/route";
import { POST as applyPOST } from "@/app/api/jobsDashboard/Candidate/application/route";
import { fakeEmbed } from "../setup/fakeEmbedder";

setupTestDb();

const O = "http://localhost";
let candidate = "", recruiter = "", other = "", jobId = "";
const cookie = async (id: string) => ({ cookie: `token=${await signJwt({ id })}` });
const asJson = async (res: Response) => ({ status: res.status, body: await res.json() });

beforeAll(async () => {
  await resetDb();
  const c = await User.create({ username: "cand", email: "cand@test.dev", password: "x", fullname: "Cand", phone: "0" } as any);
  const r = await User.create({ username: "rec", email: "rec@test.dev", password: "x", fullname: "Rec", phone: "0", recruiter: true, approved: true, company: "Acme" } as any);
  const o = await User.create({ username: "other", email: "other@test.dev", password: "x", fullname: "Other", phone: "0" } as any);
  candidate = String(c._id); recruiter = String(r._id); other = String(o._id);
  const co = await Company.create({ companyName: "Acme" } as any).catch(() => Company.findOne({ companyName: "Acme" }));
  const j = await Job.create({ job: "Junior Backend Developer", company: (co as any)._id, type: "On Site", city: "Tel Aviv", country: "Israel", publisher: r._id } as any);
  jobId = String(j._id);
});

describe("notify() + /api/notifications", () => {
  it("creates, lists newest-first with unread count, and only for the owner", async () => {
    await notify(candidate, { type: "system", title: "Welcome", body: "hi", link: "/" });
    await notify(candidate, { type: "system", title: "Second", link: "https://evil.com" }); // external link dropped
    await notify(other, { type: "system", title: "Not yours" });
    expect(await unreadCount(candidate)).toBe(2);

    const r = await asJson(await listGET(new NextRequest(`${O}/api/notifications`, { headers: await cookie(candidate) })));
    expect(r.status).toBe(200);
    expect(r.body.unreadCount).toBe(2);
    expect(r.body.items.map((n: any) => n.title)).toEqual(["Second", "Welcome"]);
    expect(r.body.items[0].link).toBe("");
    expect((await listGET(new NextRequest(`${O}/api/notifications`))).status).toBe(401);
  });

  it("marks read by ids (own only) and all", async () => {
    const mine = await Notification.findOne({ userId: candidate, title: "Welcome" });
    const theirs = await Notification.findOne({ userId: other });
    const r1 = await asJson(await readPOST(new NextRequest(`${O}/api/notifications/read`, { method: "POST", headers: await cookie(candidate), body: JSON.stringify({ ids: [String(mine!._id), String(theirs!._id)] }) })));
    expect(r1.body.updated).toBe(1); // the other user's notification is untouched
    expect((await Notification.findById(theirs!._id))!.read).toBe(false);
    const r2 = await asJson(await readPOST(new NextRequest(`${O}/api/notifications/read`, { method: "POST", headers: await cookie(candidate), body: JSON.stringify({ all: true }) })));
    expect(r2.body.updated).toBe(1);
    expect(await unreadCount(candidate)).toBe(0);
    const bad = await readPOST(new NextRequest(`${O}/api/notifications/read`, { method: "POST", headers: await cookie(candidate), body: JSON.stringify({}) }));
    expect(bad.status).toBe(400);
  });
});

describe("product triggers", () => {
  it("notifies the publisher when a candidate applies, and the candidate when the status changes", async () => {
    const apply = await asJson(await applyPOST(new NextRequest(`${O}/api/jobsDashboard/Candidate/application`, { method: "POST", headers: await cookie(candidate), body: JSON.stringify({ jobId, status: "Submitted Resume" }) })));
    expect(apply.status).toBe(200);
    const toRecruiter = await Notification.findOne({ userId: recruiter, type: "application_received" }).lean();
    expect((toRecruiter as any)?.title).toContain("Junior Backend Developer");
    expect((toRecruiter as any)?.link).toBe("/RecruiterDashboard");

    const before = await Notification.countDocuments({ userId: candidate });
    const upd = await asJson(await changeStatusPUT(new NextRequest(`${O}/api/jobsDashboard/Recruiter/changeStatus`, { method: "PUT", headers: await cookie(recruiter), body: JSON.stringify({ jobId, updateStatuses: { [candidate]: "HR Phone Interview" } }) })));
    expect(upd.status).toBe(200);
    expect((await Candidates.findOne({ candidateId: candidate, jobId }))!.status).toBe("HR Phone Interview");
    const n = await Notification.findOne({ userId: candidate, type: "application_status" }).lean();
    expect((n as any)?.body).toContain("HR Phone Interview");
    expect(await Notification.countDocuments({ userId: candidate })).toBe(before + 1);
  });

  it("refuses status changes from a non-publisher", async () => {
    const res = await changeStatusPUT(new NextRequest(`${O}/api/jobsDashboard/Recruiter/changeStatus`, { method: "PUT", headers: await cookie(other), body: JSON.stringify({ jobId, updateStatuses: { [candidate]: "Rejected" } }) }));
    expect([401, 403]).toContain(res.status);
  });
});

describe("daily job-match digest", () => {
  it("notifies users with a résumé vector about new matching postings, once per run", async () => {
    const vec = fakeEmbed("React TypeScript frontend developer");
    await User.updateOne({ _id: candidate }, { $set: { embedding: vec } });
    await ExternalJobs.create([
      { job: "Junior React Developer", company: "Acme", city: "Tel Aviv", country: "Israel", url: "u1", finalUrl: "u1", description: "React TypeScript frontend", skills: [], seniority: [], source: "greenhouse", sourceJobId: "d1", firstSeenAt: new Date(), embedding: fakeEmbed("Junior React Developer React TypeScript frontend developer") },
      { job: "Truck Driver", company: "Acme", city: "Haifa", country: "Israel", url: "u2", finalUrl: "u2", description: "driving licence", skills: [], seniority: [], source: "greenhouse", sourceJobId: "d2", firstSeenAt: new Date(), embedding: fakeEmbed("Truck Driver driving licence heavy vehicles") },
    ] as any);

    expect((await digestGET(new NextRequest(`${O}/api/notifications/job-matches?cron_secret=wrong`))).status).toBe(401);
    const dry = await asJson(await digestGET(new NextRequest(`${O}/api/notifications/job-matches?cron_secret=test-cron-secret&dry=1`)));
    expect(dry.body.notified).toBe(1);
    expect(await Notification.countDocuments({ type: "job_match" })).toBe(0);

    const run = await asJson(await digestGET(new NextRequest(`${O}/api/notifications/job-matches?cron_secret=test-cron-secret`)));
    expect(run.status).toBe(200);
    expect(run.body.notified).toBe(1);
    const n: any = await Notification.findOne({ userId: candidate, type: "job_match" }).lean();
    expect(n.body).toContain("Junior React Developer");
    expect(n.body).not.toContain("Truck Driver");
    expect(n.meta.jobIds).toHaveLength(1);
    expect((await User.findById(candidate))!.lastMatchDigestAt).toBeInstanceOf(Date);

    // Second run the same day: nothing new → no second notification.
    const again = await asJson(await digestGET(new NextRequest(`${O}/api/notifications/job-matches?cron_secret=test-cron-secret`)));
    expect(again.body.notified).toBe(0);
    expect(again.body.skippedRecent).toBe(1);
    expect(await Notification.countDocuments({ userId: candidate, type: "job_match" })).toBe(1);
  });

  it("waits at least 20h between digests for a person, and never stamps a quiet run", async () => {
    const { runJobMatchDigest } = await import("@/app/lib/notifications/digest");
    // A brand-new matching posting, but the person heard from us 2h ago → wait.
    await ExternalJobs.create({ job: "Senior React Developer", company: "Acme", city: "Tel Aviv", country: "Israel", url: "u3", finalUrl: "u3", description: "React TypeScript frontend", skills: [], seniority: [], source: "greenhouse", sourceJobId: "d3", firstSeenAt: new Date(), embedding: fakeEmbed("Senior React Developer React TypeScript frontend developer") } as any);
    await User.updateOne({ _id: candidate }, { $set: { lastMatchDigestAt: new Date(Date.now() - 2 * 3600_000) } });
    expect((await runJobMatchDigest()).notified).toBe(0);
    // 25h ago → due, and only now is the stamp moved.
    const old = new Date(Date.now() - 25 * 3600_000);
    await User.updateOne({ _id: candidate }, { $set: { lastMatchDigestAt: old } });
    expect((await runJobMatchDigest()).notified).toBe(1);
    expect((await User.findById(candidate))!.lastMatchDigestAt!.getTime()).toBeGreaterThan(old.getTime());
    // A person with nothing new above the bar is not stamped, so a quiet day does not use up their window.
    await User.updateOne({ _id: other }, { $set: { embedding: fakeEmbed("marine biologist coral reef diving research") } });
    await User.updateOne({ _id: other }, { $unset: { lastMatchDigestAt: 1 } });
    await runJobMatchDigest();
    expect((await User.findById(other))!.lastMatchDigestAt).toBeFalsy();
  });
});
