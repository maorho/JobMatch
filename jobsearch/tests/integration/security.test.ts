import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { setupTestDb, resetDb } from "../setup/mongo";

vi.mock("@/app/lib/matcher/embeddings", async () => import("../setup/fakeEmbedder"));
const s3Calls: any[] = [];
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class { async send(cmd: any) { s3Calls.push(cmd.input); return {}; } },
  PutObjectCommand: class { constructor(public input: any) {} },
  DeleteObjectCommand: class { constructor(public input: any) {} },
}));

import User from "@/app/models/User";
import Company from "@/app/models/Company";
import Job from "@/app/models/Job";
import Candidates from "@/app/models/Candidates";
import Notification from "@/app/models/Notification";
import Contact from "@/app/models/Contact";
import ApplicationOutcome from "@/app/models/ApplicationOutcome";
import Referrer from "@/app/models/Referrer";
import ReferralRequest from "@/app/models/ReferralRequest";
import UsageCounter from "@/app/models/UsageCounter";
import RateLimit from "@/app/models/RateLimit";
import { signJwt, verifyJwt, JWT_TTL_SEC } from "@/app/lib/jwt";
import { rateLimit } from "@/app/lib/ops/rateLimit";
import { requireCron } from "@/app/lib/cron/requireCron";
import { requireRecruiterOrAdmin } from "@/app/lib/authGuard";
import { setMailTransport } from "@/app/lib/email/send";
import { registerInsider, verifyInsider, VERIFY_MAX_ATTEMPTS } from "@/app/lib/referrals/insiders";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { GET as meGET } from "@/app/api/auth/me/route";
import { POST as addJobPOST } from "@/app/api/jobsDashboard/Recruiter/addNewJob/route";
import { POST as myJobsPOST } from "@/app/api/jobsDashboard/Recruiter/allRecruiterJobs/route";
import { DELETE as deleteJobDELETE } from "@/app/api/jobsDashboard/Recruiter/deleteJob/route";
import { POST as applyPOST } from "@/app/api/jobsDashboard/Candidate/application/route";
import { GET as allJobsGET } from "@/app/api/jobsDashboard/Alljobs/route";
import { POST as recruitersPOST } from "@/app/api/admin/allrecruiters/route";
import { DELETE as accountDELETE } from "@/app/api/settings/account/route";

setupTestDb();

const O = "http://localhost";
let dana = "", pending = "", approved = "", admin = "";
const tokens: Record<string, string> = {};
const authed = (who: string, url: string, init: RequestInit & { ip?: string } = {}) =>
  new NextRequest(`${O}${url}`, { ...init, headers: { cookie: `token=${tokens[who]}`, "Content-Type": "application/json", ...(init.ip ? { "x-forwarded-for": init.ip } : {}), ...(init.headers || {}) } } as any);
const json = (url: string, body: unknown, headers: Record<string, string> = {}) => new NextRequest(`${O}${url}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) } as any);

beforeAll(async () => {
  await resetDb();
  await RateLimit.syncIndexes();
  const acme = await Company.create({ companyName: "Acme" } as any);
  const mk = async (u: Record<string, unknown>) => String((await User.create({ password: await bcrypt.hash("correct-horse-1", 4), phone: "0", ...u } as any))._id);
  dana = await mk({ username: "dana", email: "dana@test.dev", fullname: "Dana Levi", resume: "resumes/abc.pdf" });
  pending = await mk({ username: "pending", email: "pending@acme.com", fullname: "Pending Recruiter", recruiter: true, approved: false, company: "Acme", company_id: acme._id });
  approved = await mk({ username: "approved", email: "approved@acme.com", fullname: "Approved Recruiter", recruiter: true, approved: true, company: "Acme", company_id: acme._id });
  admin = await mk({ username: "admin", email: "admin@test.dev", fullname: "Admin", admin: true });
  for (const [k, id] of Object.entries({ dana, pending, approved, admin })) tokens[k] = await signJwt({ id });
  process.env.S3_BUCKET_NAME = "test-bucket";
});

describe("login: no enumeration, brute-force lock-out, 7-day sliding sessions", () => {
  it("answers the same 401 for an unknown address and a wrong password, then 429 after 10 tries", async () => {
    const ip = "203.0.113.7";
    const attempt = (email: string, password: string) => loginPOST(json("/api/auth/login", { email, password }, { "x-forwarded-for": ip }));
    const unknown = await attempt("nobody@test.dev", "whatever");
    const wrong = await attempt("dana@test.dev", "wrong-password");
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(await unknown.json()).toEqual(await wrong.json()); // identical body: "אימייל או סיסמה שגויים"
    const ok = await attempt("dana@test.dev", "correct-horse-1");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toMatch(/token=/);
    for (let i = 3; i < 10; i++) await attempt("x@test.dev", "nope");
    const locked = await attempt("dana@test.dev", "correct-horse-1"); // 11th from this IP: refused even with the right password
    expect(locked.status).toBe(429);
    expect(locked.headers.get("retry-after")).toMatch(/^\d+$/);
    expect((await locked.json()).message).toMatch(/יותר מדי ניסיונות/);
    // Another IP, same account: the per-email counter is separate but also 10.
    for (let i = 0; i < 10; i++) await loginPOST(json("/api/auth/login", { email: "dana@test.dev", password: "nope" }, { "x-forwarded-for": "198.51.100.9" }));
    expect((await loginPOST(json("/api/auth/login", { email: "dana@test.dev", password: "correct-horse-1" }, { "x-forwarded-for": "198.51.100.10" }))).status).toBe(429);
  });

  it("the password hash never leaves the DB unless asked for", async () => {
    const u: any = await User.findById(dana);
    expect(u.password).toBeUndefined();
    expect(((await User.findById(dana).select("+password")) as any).password).toMatch(/^\$2[aby]\$/);
    expect(((await User.findById(dana).lean()) as any).channelLinkCode).toBeUndefined();
  });

  it("tokens live 7 days; /api/auth/me re-signs one that is past half-life and leaves a fresh one alone", async () => {
    const fresh = await verifyJwt<{ exp: number }>(tokens.dana);
    expect(fresh!.exp - Math.floor(Date.now() / 1000)).toBeGreaterThan(JWT_TTL_SEC - 60);
    const untouched = await meGET(authed("dana", "/api/auth/me"));
    expect(untouched.status).toBe(200);
    expect(untouched.headers.get("set-cookie")).toBeNull();

    const old = await signJwt({ id: dana, email: "dana@test.dev", admin: false }, { expiresIn: "1h" });
    const refreshed = await meGET(new NextRequest(`${O}/api/auth/me`, { headers: { cookie: `token=${old}` } } as any));
    expect(refreshed.status).toBe(200);
    const cookie = refreshed.headers.get("set-cookie") || "";
    expect(cookie).toMatch(/^token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(new RegExp(`Max-Age=${JWT_TTL_SEC}`, "i"));
    const reissued = await verifyJwt<{ id: string; email: string; admin: boolean; exp: number }>(/token=([^;]+)/.exec(cookie)![1]);
    expect(reissued).toMatchObject({ id: dana, email: "dana@test.dev", admin: false });
    expect(reissued!.exp - Math.floor(Date.now() / 1000)).toBeGreaterThan(JWT_TTL_SEC - 60);
  });
});

describe("rateLimit + requireCron", () => {
  it("counts per key in fixed windows and reports when to retry", async () => {
    for (let i = 0; i < 3; i++) expect((await rateLimit("t:k", 3, 60_000)).ok).toBe(true);
    const over = await rateLimit("t:k", 3, 60_000);
    expect(over.ok).toBe(false);
    expect(over.retryAfterSec).toBeGreaterThan(0);
    expect(over.retryAfterSec).toBeLessThanOrEqual(60);
    expect((await rateLimit("t:other", 3, 60_000)).ok).toBe(true);
    const idx = await RateLimit.collection.indexes();
    expect(idx.some((i: any) => i.expireAfterSeconds)).toBe(true);
  });

  it("accepts Bearer, x-service-token and the legacy query; fails closed without CRON_SECRET", () => {
    const r = (init: { url?: string; headers?: Record<string, string> } = {}) => requireCron(new NextRequest(`${O}/api/x${init.url || ""}`, { headers: init.headers || {} } as any));
    expect(r({ headers: { authorization: "Bearer test-cron-secret" } })).toBeNull();
    expect(r({ headers: { "x-service-token": "test-cron-secret" } })).toBeNull();
    expect(r({ url: "?cron_secret=test-cron-secret" })).toBeNull();
    expect(r({ headers: { authorization: "Bearer test-cron-secret-longer" } })!.status).toBe(401);
    expect(r({ url: "?cron_secret=nope" })!.status).toBe(401);
    expect(r()!.status).toBe(401);
    const saved = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "";
    expect(r({ url: "?cron_secret=" })!.status).toBe(401);
    expect(r({ headers: { authorization: "Bearer " } })!.status).toBe(401);
    process.env.CRON_SECRET = saved;
  });
});

describe("recruiter routes: approval required, ownership from the session", () => {
  let jobId = "";
  it("an unapproved recruiter is told to wait; an approved one posts under their own id and company", async () => {
    expect(await requireRecruiterOrAdmin(authed("pending", "/x"))).toBeNull();
    expect(await requireRecruiterOrAdmin(authed("approved", "/x"))).toMatchObject({ admin: false, company: "Acme" });
    const body = { job: "QA Engineer", company: "SomeoneElse", type: "On Site", city: "Tel Aviv", country: "Israel", description: "d", qualifications: "q", publisher: admin };
    const denied = await addJobPOST(authed("pending", "/api/jobsDashboard/Recruiter/addNewJob", { method: "POST", body: JSON.stringify(body) }));
    expect(denied.status).toBe(403);
    expect((await denied.json()).message).toBe("החשבון ממתין לאישור מנהל");
    expect((await addJobPOST(authed("dana", "/api/jobsDashboard/Recruiter/addNewJob", { method: "POST", body: JSON.stringify(body) }))).status).toBe(401);
    expect((await addJobPOST(json("/api/jobsDashboard/Recruiter/addNewJob", body))).status).toBe(401);
    const ok = await addJobPOST(authed("approved", "/api/jobsDashboard/Recruiter/addNewJob", { method: "POST", body: JSON.stringify(body) }));
    expect(ok.status).toBe(200);
    jobId = (await ok.json()).jobId;
    const job: any = await Job.findById(jobId).lean();
    expect(String(job.publisher)).toBe(approved); // not the body's publisher
    expect(String(job.company)).toBe(String((await Company.findOne({ companyName: "Acme" }))!._id)); // not the body's company
  });

  it("allRecruiterJobs ignores a recruiterId in the body; deleteJob checks ownership in the DB", async () => {
    const mine = await (await myJobsPOST(authed("approved", "/api/jobsDashboard/Recruiter/allRecruiterJobs", { method: "POST", body: JSON.stringify({ recruiterId: admin }) }))).json();
    expect(mine.map((j: any) => String(j._id))).toEqual([jobId]);
    expect((await myJobsPOST(authed("pending", "/api/jobsDashboard/Recruiter/allRecruiterJobs", { method: "POST", body: "{}" }))).status).toBe(403);
    // A token claiming admin:true does not make one: the role is read from the DB.
    const forged = await signJwt({ id: dana, email: "dana@test.dev", admin: true });
    const res = await deleteJobDELETE(new NextRequest(`${O}/api/jobsDashboard/Recruiter/deleteJob?jobId=${jobId}`, { method: "DELETE", headers: { cookie: `token=${forged}` } } as any));
    expect(res.status).toBe(401);
    expect((await deleteJobDELETE(authed("approved", `/api/jobsDashboard/Recruiter/deleteJob?jobId=not-an-id`, { method: "DELETE" }))).status).toBe(400);
    expect((await deleteJobDELETE(authed("approved", `/api/jobsDashboard/Recruiter/deleteJob?jobId=${jobId}`, { method: "DELETE" }))).status).toBe(200);
    expect(await Job.countDocuments()).toBe(0);
  });

  it("admin/allrecruiters returns only the dashboard's fields", async () => {
    const rows = await (await recruitersPOST(authed("admin", "/api/admin/allrecruiters", { method: "POST", body: JSON.stringify({ companyName: "Acme" }) }))).json();
    expect(rows).toHaveLength(2);
    expect(Object.keys(rows[0]).sort()).toEqual(["_id", "approved", "company", "company_id", "createdAt", "email", "fullname"]);
    expect(rows[0].password).toBeUndefined();
  });
});

describe("applications and the catalogue", () => {
  it("validates jobId and status, and answers 409 on a duplicate", async () => {
    const apply = (body: unknown) => applyPOST(authed("dana", "/api/jobsDashboard/Candidate/application", { method: "POST", body: JSON.stringify(body) }));
    const jobId = String(new mongoose.Types.ObjectId());
    expect((await apply({ jobId: "x" })).status).toBe(400);
    expect((await apply({ jobId, status: "Hired By Magic" })).status).toBe(400);
    expect((await apply({ jobId, status: "Submitted Resume" })).status).toBe(200);
    expect((await apply({ jobId })).status).toBe(409);
    expect(await Candidates.countDocuments({ candidateId: dana })).toBe(1);
  });

  it("Alljobs clamps page and limit", async () => {
    const acme: any = await Company.findOne({ companyName: "Acme" });
    for (let i = 0; i < 3; i++) await Job.create({ job: `J${i}`, company: acme._id, companyName: "Acme", type: "Remote", city: "c", country: "il", publisher: approved } as any);
    const r = await (await allJobsGET(new NextRequest(`${O}/api/jobsDashboard/Alljobs?limit=100000&page=abc`))).json();
    expect(r.page).toBe(1);
    expect(r.pages).toBe(1); // ceil(3 / 100)
    const r2 = await (await allJobsGET(new NextRequest(`${O}/api/jobsDashboard/Alljobs?limit=0&page=-4`))).json();
    expect(r2.page).toBe(1);
    expect(r2.jobs).toHaveLength(1); // limit clamped to 1
  });
});

describe("insider verification codes", () => {
  it("are 8 characters, and die after 5 wrong guesses", async () => {
    const outbox: { subject: string }[] = [];
    setMailTransport(async (m) => { outbox.push(m); return { id: "1" }; });
    const { default: CompanySource } = await import("@/app/models/CompanySource");
    await CompanySource.create({ companyName: "Wix", atsType: "comeet", identifier: "wix", domain: "wix.com", careersUrl: "https://wix.com/jobs" } as any);
    expect((await registerInsider(dana, { company: "Wix", workEmail: "dana@wix.com" })).ok).toBe(true);
    const code = /^([A-Z2-9]{8}) is your/.exec(outbox[0].subject)![1];
    expect(code).not.toMatch(/[01OI]/);
    for (let i = 0; i < VERIFY_MAX_ATTEMPTS; i++) expect(await verifyInsider(dana, "Wix", "WRONG" + i)).toEqual({ ok: false, error: "invalid" });
    expect(await verifyInsider(dana, "Wix", code)).toEqual({ ok: false, error: "expired" }); // too many guesses: the code is gone
    expect(((await Referrer.findOne({ userId: dana }).select("+verifyCodeHash").lean()) as any).verifyCodeHash).toBeUndefined();
    // A fresh code starts a fresh count and accepts lower-case / dashed input.
    expect((await registerInsider(dana, { company: "Wix", workEmail: "dana@wix.com" })).ok).toBe(true);
    const code2 = /^([A-Z2-9]{8}) is your/.exec(outbox[1].subject)![1];
    expect(await verifyInsider(dana, "Wix", code2.toLowerCase().slice(0, 4) + "-" + code2.slice(4))).toEqual({ ok: true });
    setMailTransport(null);
  });
});

describe("account deletion", () => {
  it("removes every row keyed to the person and the résumé object in S3", async () => {
    const uid = new mongoose.Types.ObjectId(dana);
    await Notification.collection.insertOne({ userId: uid, title: "x" });
    await Contact.collection.insertOne({ userId: uid, name: "c" });
    await ApplicationOutcome.collection.insertOne({ userId: uid });
    await ReferralRequest.collection.insertOne({ candidateId: uid, status: "requested" });
    await UsageCounter.collection.insertOne({ userId: uid, day: "2026-01-01", key: "k", n: 1 });
    const other = new mongoose.Types.ObjectId();
    await Notification.collection.insertOne({ userId: other, title: "keep" });

    expect((await accountDELETE(authed("dana", "/api/settings/account", { method: "DELETE", body: JSON.stringify({ confirm: "nope" }) }))).status).toBe(400);
    const res = await accountDELETE(authed("dana", "/api/settings/account", { method: "DELETE", body: JSON.stringify({ confirm: "DELETE" }) }));
    expect(res.status).toBe(200);
    expect(await User.findById(dana)).toBeNull();
    for (const M of [Notification, Contact, ApplicationOutcome, UsageCounter, Referrer]) expect(await (M as any).countDocuments({ userId: uid })).toBe(0);
    expect(await Candidates.countDocuments({ candidateId: uid })).toBe(0);
    expect(await ReferralRequest.countDocuments({ candidateId: uid })).toBe(0);
    expect(await Notification.countDocuments({ userId: other })).toBe(1);
    expect(s3Calls.at(-1)).toEqual({ Bucket: "test-bucket", Key: "resumes/abc.pdf" });
  });
});
