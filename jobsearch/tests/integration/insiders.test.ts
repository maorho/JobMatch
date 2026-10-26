import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

vi.mock("@/app/lib/matcher/embeddings", async () => import("../setup/fakeEmbedder"));

import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import CompanySource from "@/app/models/CompanySource";
import Candidates from "@/app/models/Candidates";
import ApplicationOutcome from "@/app/models/ApplicationOutcome";
import Notification from "@/app/models/Notification";
import ReferralRequest from "@/app/models/ReferralRequest";
import { signJwt } from "@/app/lib/jwt";
import { setMailTransport } from "@/app/lib/email/send";
import { emailMatchesCompany, registerInsider, verifyInsider, insidersAt, requestReferral, respondToRequest, withdrawRequest, expireStaleRequests, referralsOverview, myInsiderProfiles, updateInsider } from "@/app/lib/referrals/insiders";
import { hasInsiderReferral } from "@/app/lib/referrals/hasReferral";
import { GET as insidersGET, POST as insidersPOST, PUT as insidersPUT } from "@/app/api/referrals/insiders/route";
import { POST as requestsPOST, GET as requestsGET } from "@/app/api/referrals/requests/route";
import { PATCH as requestPATCH } from "@/app/api/referrals/requests/[id]/route";

setupTestDb();

const outbox: { to: string; subject: string; text: string }[] = [];
let dana = "", yossi = "", jobId = "", tokenD = "", tokenY = "";
beforeAll(async () => {
  await resetDb();
  setMailTransport(async (m) => {
    outbox.push(m);
    return { id: String(outbox.length) };
  });
  dana = String((await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana Levi", phone: "0", resumeText: "Junior React developer", level: "junior", currentJob: "Frontend Developer" } as any))._id);
  yossi = String((await User.create({ username: "yossi", email: "yossi@gmail.com", password: "x", fullname: "Yossi Cohen", phone: "0" } as any))._id);
  await CompanySource.create({ companyName: "Wix", atsType: "comeet", slug: "wix", domain: "wix.com", careersUrl: "https://wix.com/jobs" } as any).catch(async () => ExternalJobs.create({ job: "x", company: "Wix", companyDomain: "wix.com", city: "Tel Aviv", country: "Israel", url: "u0", finalUrl: "u0", description: "", skills: [], seniority: [], source: "comeet", sourceJobId: "w0" } as any));
  jobId = String((await ExternalJobs.create({ job: "Junior React Developer", company: "Wix", companyDomain: "wix.com", city: "Tel Aviv", country: "Israel", url: "https://wix.com/jobs/1", finalUrl: "https://wix.com/jobs/1", description: "React", skills: [], seniority: [], source: "comeet", sourceJobId: "w1" } as any))._id);
  tokenD = await signJwt({ id: dana });
  tokenY = await signJwt({ id: yossi });
});
afterAll(() => setMailTransport(null));
const authed = (token: string, url: string, init: RequestInit = {}) => new NextRequest(`http://localhost${url}`, { ...init, headers: { cookie: `token=${token}`, "Content-Type": "application/json", ...(init.headers || {}) } } as any);
const code = () => /^([A-Z2-9]{8}) is your/.exec(outbox.at(-1)!.subject)![1];

describe("insiders: registration and verification", () => {
  it("only a work address on the company's domain qualifies", () => {
    expect(emailMatchesCompany("yossi@wix.com", "Wix", "wix.com")).toBe(true);
    expect(emailMatchesCompany("yossi@eng.wix.com", "Wix", "wix.com")).toBe(true);
    expect(emailMatchesCompany("yossi@wix.com", "Wix.com Ltd", "")).toBe(true); // domain root ≈ company key
    expect(emailMatchesCompany("yossi@gmail.com", "Wix", "wix.com")).toBe(false);
    expect(emailMatchesCompany("yossi@monday.com", "Wix", "wix.com")).toBe(false);
    expect(emailMatchesCompany("nope", "Wix", "wix.com")).toBe(false);
  });

  it("registers with a mailed 8-character code (hash stored), verifies once, and appears for candidates", async () => {
    expect(await registerInsider(yossi, { company: "Wix", workEmail: "yossi@gmail.com" })).toEqual({ ok: false, error: "domain_mismatch" });
    const r = await registerInsider(yossi, { company: "Wix", title: "Backend Developer", workEmail: "Yossi@Wix.com", note: "Backend/fullstack only" });
    expect(r).toMatchObject({ ok: true, verified: false, sent: true });
    expect(outbox.at(-1)!.to).toBe("yossi@wix.com");
    expect(await insidersAt("Wix")).toEqual([]); // not verified yet
    expect(await verifyInsider(yossi, "Wix", "000000")).toEqual({ ok: false, error: "invalid" });
    expect(await verifyInsider(yossi, "Wix", code())).toEqual({ ok: true });
    const list = await insidersAt("wix.com ltd"); // any spelling of the company
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ firstName: "Yossi", title: "Backend Developer", available: true });
    expect((list[0] as any).workEmail).toBeUndefined(); // never exposed
    const mine = await myInsiderProfiles(yossi);
    expect(mine[0]).toMatchObject({ company: "Wix", verified: true, open: 0, capacity: 5 });
  });
});

describe("referral requests", () => {
  let requestId = "";
  it("a candidate asks from the job page; the insider is notified; one request per job and five open at most", async () => {
    const r = await requestReferral(dana, { jobId, jobModel: "ExternalJobs", message: "Hi Yossi, 2 years of React, I built…", matchScore: 85 });
    expect(r.ok).toBe(true);
    requestId = (r as any).requestId;
    expect((r as any).referrer.firstName).toBe("Yossi");
    const n: any = await Notification.findOne({ userId: yossi, type: "referral" }).lean();
    expect(n.title).toMatch(/בקשת הפניה: Junior React Developer ב-Wix/);
    expect(n.link).toBe("/referrals");
    expect(await requestReferral(dana, { jobId, jobModel: "ExternalJobs" })).toEqual({ ok: false, error: "already_requested" });
    expect(await requestReferral(yossi, { jobId, jobModel: "ExternalJobs" })).toEqual({ ok: false, error: "self" });
    expect((await insidersAt("Wix"))[0].available).toBe(true); // 1 of 5
    await updateInsider(yossi, "Wix", { capacity: 1 });
    expect((await insidersAt("Wix"))[0].available).toBe(false);
    const other = String((await ExternalJobs.create({ job: "QA", company: "Wix", companyDomain: "wix.com", city: "Tel Aviv", country: "Israel", url: "u2", finalUrl: "u2", description: "", skills: [], seniority: [], source: "comeet", sourceJobId: "w2" } as any))._id);
    expect(await requestReferral(dana, { jobId: other, jobModel: "ExternalJobs" })).toEqual({ ok: false, error: "no_insider" }); // nobody available
    await updateInsider(yossi, "Wix", { capacity: 5 });
    expect(await hasInsiderReferral(dana, "Wix")).toBe(false); // only requested so far
  });

  it("the insider accepts, then reports the submission → an application + a referred outcome exist, the candidate is told", async () => {
    expect(await respondToRequest(dana, requestId, "accept")).toEqual({ ok: false, error: "not_found" }); // not their inbox
    expect(await respondToRequest(yossi, requestId, "accept", "Sending it today")).toEqual({ ok: true, status: "accepted" });
    expect(await hasInsiderReferral(dana, "Wix")).toBe(true);
    expect(await respondToRequest(yossi, requestId, "accept")).toEqual({ ok: false, error: "bad_transition" });
    expect(await respondToRequest(yossi, requestId, "submitted", "Done, HR has it")).toEqual({ ok: true, status: "submitted" });
    const app: any = await Candidates.findOne({ candidateId: dana, jobId }).lean();
    expect(app.status).toBe("Submitted Resume");
    const outcome: any = await ApplicationOutcome.findOne({ userId: dana, applicationId: app._id }).lean();
    expect(outcome.features.hasReferral).toBe(true);
    expect(outcome.features.matchScore).toBe(85);
    const told: any = await Notification.find({ userId: dana, type: "referral" }).sort({ createdAt: 1 }).lean();
    expect(told.map((t: any) => t.title)).toEqual(["Yossi מ-Wix ימליץ/תמליץ עליך", "קורות החיים שלך הוגשו ב-Wix עם הפניה מבפנים"]);
    const ov = await referralsOverview(yossi);
    expect(ov.inbox[0]).toMatchObject({ status: "submitted", candidate: { name: "Dana Levi", level: "junior" } });
    expect(ov.profiles[0].stats).toMatchObject({ requests: 1, accepted: 1, submitted: 1 });
    expect((await referralsOverview(dana)).mine[0]).toMatchObject({ status: "submitted", referrer: "Yossi", referrerNote: "Done, HR has it" });
  });

  it("withdraw and expiry free the slot", async () => {
    const j3 = String((await ExternalJobs.create({ job: "Data", company: "Wix", companyDomain: "wix.com", city: "Tel Aviv", country: "Israel", url: "u3", finalUrl: "u3", description: "", skills: [], seniority: [], source: "comeet", sourceJobId: "w3" } as any))._id);
    const r: any = await requestReferral(dana, { jobId: j3, jobModel: "ExternalJobs", message: "x" });
    expect(await withdrawRequest(dana, r.requestId)).toBe(true);
    expect(await withdrawRequest(dana, r.requestId)).toBe(false);
    await ReferralRequest.collection.updateOne({ _id: new (await import("mongoose")).default.Types.ObjectId(r.requestId) }, { $set: { status: "requested", createdAt: new Date(Date.now() - 20 * 86_400_000) } }); // raw driver: Mongoose keeps createdAt immutable
    expect(await expireStaleRequests()).toBe(1);
    expect(((await ReferralRequest.findById(r.requestId).lean()) as any).status).toBe("expired");
  });

  it("the API routes", async () => {
    const pub = await (await insidersGET(new NextRequest("http://localhost/api/referrals/insiders?company=Wix"))).json();
    expect(pub).toMatchObject({ count: 1, available: 1 });
    expect(pub.insiders[0].firstName).toBe("Yossi");
    expect((await insidersPOST(authed(tokenD, "/api/referrals/insiders", { method: "POST", body: JSON.stringify({ company: "Wix", workEmail: "dana@gmail.com" }) }))).status).toBe(400);
    const reg = await (await insidersPOST(authed(tokenD, "/api/referrals/insiders", { method: "POST", body: JSON.stringify({ company: "Wix", title: "QA", workEmail: "dana@wix.com" }) }))).json();
    expect(reg).toMatchObject({ ok: true, sent: true });
    expect((await (await insidersPUT(authed(tokenD, "/api/referrals/insiders", { method: "PUT", body: JSON.stringify({ company: "Wix", code: code() }) }))).json()).ok).toBe(true);
    const j4 = String((await ExternalJobs.create({ job: "DevOps", company: "Wix", companyDomain: "wix.com", city: "Tel Aviv", country: "Israel", url: "u4", finalUrl: "u4", description: "", skills: [], seniority: [], source: "comeet", sourceJobId: "w4" } as any))._id);
    const req = await (await requestsPOST(authed(tokenY, "/api/referrals/requests", { method: "POST", body: JSON.stringify({ jobId: j4, jobModel: "ExternalJobs", message: "Hi Dana, could you refer me?" }) }))).json();
    expect(req.ok).toBe(true);
    expect(req.referrer.firstName).toBe("Dana"); // Yossi can't refer himself, so Dana (now an insider too) gets it
    const inbox = await (await requestsGET(authed(tokenD, "/api/referrals/requests"))).json();
    expect(inbox.inbox[0]).toMatchObject({ status: "requested", candidate: { name: "Yossi Cohen" } });
    // Straight from "requested" to "submitted" (no accept step): the outcome must still be marked as referred.
    const patched = await (await requestPATCH(authed(tokenD, `/api/referrals/requests/${req.requestId}`, { method: "PATCH", body: JSON.stringify({ action: "submitted", note: "Sent it" }) }), { params: Promise.resolve({ id: req.requestId }) })).json();
    expect(patched).toEqual({ ok: true, status: "submitted" });
    const yApp: any = await Candidates.findOne({ candidateId: yossi, jobId: j4 }).lean();
    expect(((await ApplicationOutcome.findOne({ userId: yossi, applicationId: yApp._id }).lean()) as any).features.hasReferral).toBe(true);
    expect((await requestsGET(new NextRequest("http://localhost/api/referrals/requests"))).status).toBe(401);
  });
});
