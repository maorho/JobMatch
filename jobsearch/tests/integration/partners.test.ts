import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

delete process.env.OPENAI_API_KEY;
vi.mock("@/app/lib/matcher/embeddings", async () => import("../setup/fakeEmbedder"));
vi.mock("@aws-sdk/client-s3", () => ({ S3Client: class { async send() { return {}; } }, PutObjectCommand: class { constructor(public input: any) {} } }));
vi.mock("@/app/lib/pdf/extractText", () => ({ extractPdfText: async () => ({ text: "Junior React developer" }) }));

import mongoose from "mongoose";
import User from "@/app/models/User";
import Partner from "@/app/models/Partner";
import ExternalJobs from "@/app/models/ExternalJobs";
import Candidates from "@/app/models/Candidates";
import InterviewSession from "@/app/models/InterviewSession";
import { signJwt } from "@/app/lib/jwt";
import { createPartner, attachPartner, partnerFunnel, makeInviteCode, slugify, partnerForToken, REF_COOKIE } from "@/app/lib/partners/partners";
import { recordOutcome, ensureOutcome } from "@/app/lib/outcomes/outcomes";
import { GET as partnersGET, POST as partnersPOST } from "@/app/api/partners/route";
import { GET as joinGET, POST as joinPOST } from "@/app/api/partners/join/route";
import { GET as statsGET } from "@/app/api/partners/[slug]/stats/route";
import { POST as signupPOST } from "@/app/api/auth/signup/route";
import { generateMetadata as landingMetadata } from "@/app/partners/[slug]/page";

setupTestDb();

const O = "http://localhost";
const cookie = async (id: string) => ({ cookie: `token=${await signJwt({ id })}`, "Content-Type": "application/json" });
const j = async (r: Response) => ({ status: r.status, body: await r.json() });
let admin = "", dana = "", code = "", token = "", slug = "";

beforeAll(async () => {
  await resetDb();
  process.env.AWS_REGION = "eu-west-1";
  process.env.S3_BUCKET_NAME = "test";
  admin = String((await User.create({ username: "admin", email: "admin@test.dev", password: "x", fullname: "Admin", phone: "050", admin: true } as any))._id);
  dana = String((await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana", phone: "050", resumeUpdatedAt: new Date() } as any))._id);
});

describe("partner program", () => {
  it("admin creates a partner: slug, typeable invite code, dashboard token shown once", async () => {
    expect((await partnersPOST(new NextRequest(`${O}/api/partners`, { method: "POST", headers: await cookie(dana), body: JSON.stringify({ name: "ITC" }) }))).status).toBe(401);
    const { status, body } = await j(await partnersPOST(new NextRequest(`${O}/api/partners`, { method: "POST", headers: await cookie(admin), body: JSON.stringify({ name: "Israel Tech Challenge", kind: "bootcamp", cohort: "Cohort 14", blurb: "Full-stack bootcamp" }) })));
    expect(status).toBe(200);
    expect(body.partner).toMatchObject({ name: "Israel Tech Challenge", slug: "israel-tech-challenge", kind: "bootcamp", cohort: "Cohort 14" });
    expect(body.partner.inviteCode).toMatch(/^ISRA-\d{4}$/);
    expect(body.token).toMatch(/^jmp_/);
    expect(body.partner.tokenHash).toBeUndefined();
    expect(body.signupUrl).toContain(`/SignUp?ref=${body.partner.inviteCode}`);
    expect(body.dashboardUrl).toContain(`/partners/israel-tech-challenge/dashboard?token=${body.token}`);
    code = body.partner.inviteCode;
    token = body.token;
    slug = body.partner.slug;
    // The hash never comes back from a plain query.
    expect(((await Partner.findOne({ slug }).lean()) as any).tokenHash).toBeUndefined();
    expect(await partnerForToken(slug, token)).toMatchObject({ slug });
    expect(await partnerForToken(slug, "jmp_wrong")).toBeNull();
    // Second partner with the same name gets a distinct slug.
    const second = await createPartner({ name: "Israel Tech Challenge" });
    expect(second.partner.slug).toBe("israel-tech-challenge-2");
    expect(makeInviteCode("AB")).toMatch(/^ABJM-\d{4}$/);
    expect(slugify("Technion — CS")).toBe("technion-cs");
  });

  it("members join by code (signup form, cookie for OAuth, or the join API) and keep their first partner", async () => {
    // Existing user joins from Settings.
    expect((await j(await joinGET(new NextRequest(`${O}/api/partners/join?code=${code.toLowerCase()}`)))).body).toMatchObject({ valid: true, name: "Israel Tech Challenge" });
    expect((await j(await joinGET(new NextRequest(`${O}/api/partners/join?code=NOPE-0000`)))).body.valid).toBe(false);
    const joined = await j(await joinPOST(new NextRequest(`${O}/api/partners/join`, { method: "POST", headers: await cookie(dana), body: JSON.stringify({ code }) })));
    expect(joined.status).toBe(200);
    expect(joined.body.partner.slug).toBe(slug);
    expect(((await User.findById(dana).lean()) as any).partner).toMatchObject({ slug, code, cohort: "Cohort 14" });
    expect((await joinPOST(new NextRequest(`${O}/api/partners/join`, { method: "POST", headers: await cookie(dana), body: JSON.stringify({ code: "NOPE-0000" }) }))).status).toBe(404);
    // A second code doesn't move them.
    const other = await createPartner({ name: "Other" });
    expect(await attachPartner(dana, other.partner.inviteCode)).toMatchObject({ ok: true, reason: "has_other" });
    expect(((await User.findById(dana).lean()) as any).partner.slug).toBe(slug);

    // New signup carrying ?ref= (form field) …
    const form = new FormData();
    for (const [k, v] of Object.entries({ email: "yoav@test.dev", password: "secret123", fullname: "Yoav", username: "yoav", phone: "050", recruiter: "false", admin: "false", company: "", ref: code })) form.append(k, v);
    form.append("resume", new File([new Uint8Array([37, 80, 68, 70])], "cv.pdf", { type: "application/pdf" }));
    const s = await signupPOST(new NextRequest(`${O}/api/auth/signup`, { method: "POST", body: form }));
    expect(s.status).toBe(200);
    expect(((await User.findOne({ email: "yoav@test.dev" }).lean()) as any).partner.slug).toBe(slug);
    // … or the landing-page cookie (what the OAuth path reads).
    const form2 = new FormData();
    for (const [k, v] of Object.entries({ email: "noa@test.dev", password: "secret123", fullname: "Noa", username: "noa", phone: "050", recruiter: "false", admin: "false", company: "" })) form2.append(k, v);
    form2.append("resume", new File([new Uint8Array([37, 80, 68, 70])], "cv.pdf", { type: "application/pdf" }));
    const s2 = await signupPOST(new NextRequest(`${O}/api/auth/signup`, { method: "POST", body: form2, headers: { cookie: `${REF_COOKIE}=${code}` } }));
    expect(s2.status).toBe(200);
    expect(((await User.findOne({ email: "noa@test.dev" }).lean()) as any).partner.slug).toBe(slug);
  });

  it("the funnel counts the cohort's résumés, applications, interviews, offers and mock interviews", async () => {
    const job: any = await ExternalJobs.create({ job: "Junior Dev", company: "Acme", city: "Tel Aviv", country: "Israel", url: "u", finalUrl: "u", description: "React", skills: [], seniority: [], source: "greenhouse", sourceJobId: "a1", postedAt: new Date() } as any);
    const yoav = String(((await User.findOne({ email: "yoav@test.dev" }).lean()) as any)._id);
    const a1: any = await Candidates.create({ candidateId: dana, jobId: job._id, jobModel: "ExternalJobs", status: "Submitted Resume" });
    const a2: any = await Candidates.create({ candidateId: yoav, jobId: job._id, jobModel: "ExternalJobs", status: "Submitted Resume" });
    await ensureOutcome(dana, String(a1._id));
    await ensureOutcome(yoav, String(a2._id));
    await recordOutcome({ userId: dana, applicationId: String(a1._id), outcome: "offer", source: "user" });
    await recordOutcome({ userId: yoav, applicationId: String(a2._id), outcome: "no_reply", source: "timeout" });
    await InterviewSession.create({ userId: dana, prepId: new mongoose.Types.ObjectId(), jobId: job._id, source: "external", jobTitle: "Junior Dev", company: "Acme", stage: "hr", language: "he", targetQuestions: 3 } as any);

    const f = await partnerFunnel(slug);
    expect(f).toMatchObject({ members: 3, withResume: 3, applied: 2, applications: 2, interviews: 1, offers: 1, mockInterviews: 1, responseRate: 50 });
    expect(f.activeLast7d).toBe(3);

    // Stats route: partner token or admin; the token works without a login.
    expect((await statsGET(new NextRequest(`${O}/api/partners/${slug}/stats`), { params: Promise.resolve({ slug }) })).status).toBe(401);
    const byToken = await j(await statsGET(new NextRequest(`${O}/api/partners/${slug}/stats?token=${token}`), { params: Promise.resolve({ slug }) }));
    expect(byToken.body.funnel.members).toBe(3);
    expect(byToken.body.partner.inviteCode).toBe(code);
    const byAdmin = await j(await statsGET(new NextRequest(`${O}/api/partners/${slug}/stats`, { headers: await cookie(admin) }), { params: Promise.resolve({ slug }) }));
    expect(byAdmin.body.funnel.offers).toBe(1);
    const list = await j(await partnersGET(new NextRequest(`${O}/api/partners`, { headers: await cookie(admin) })));
    expect(list.body.partners.find((p: any) => p.slug === slug).funnel.members).toBe(3);
    expect(list.body.partners[0].tokenHash).toBeUndefined();

    const meta = await landingMetadata({ params: Promise.resolve({ slug }) });
    expect(String(meta.title)).toMatch(/Israel Tech Challenge × JobMatch/);
    expect((await landingMetadata({ params: Promise.resolve({ slug: "nobody" }) })).robots).toMatchObject({ index: false });
  });
});
