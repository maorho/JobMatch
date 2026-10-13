import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

delete process.env.OPENAI_API_KEY;
vi.mock("@/app/lib/matcher/embeddings", async () => import("../setup/fakeEmbedder"));

// The form-filler is scripted per URL; the tailor returns the stored résumé unchanged.
const submitCalls: any[] = [];
vi.mock("@/app/lib/apply/submit", async (importOriginal) => {
  const orig: any = await importOriginal();
  return {
    ...orig,
    // Two-phase protocol: a dry run reports the remaining fields; the real
    // call succeeds only when the answers cover them.
    submitExternalApplication: vi.fn(async (input: any) => {
      submitCalls.push({ url: input.url, profile: input.profile, bytes: input.resumePdf.byteLength, dryRun: !!input.dryRun, answers: input.answers || [] });
      if (input.url.includes("greenhouse")) {
        const fields = [
          { selector: "#country", label: "Country", type: "combobox", required: true },
          { selector: "select[name='source']", label: "How did you hear about us?", type: "select", required: true, options: ["LinkedIn", "Friend", "Other"] },
        ];
        if (input.dryRun) return { status: "needs_user", ats: "greenhouse", reason: "The form asks for: Country, How did you hear about us?.", fields, missing: fields.map((f) => f.label) };
        const got = new Set((input.answers || []).map((a: any) => a.selector));
        return fields.every((f) => got.has(f.selector)) ? { status: "submitted", ats: "greenhouse", confirmation: "Thank you for applying" } : { status: "needs_user", ats: "greenhouse", reason: "still missing" };
      }
      if (input.url.includes("lever")) {
        const fields = [{ selector: "textarea[name='cards[1][field0]']", label: "Describe a time you handled a difficult client (required)", type: "textarea", required: true }];
        return { status: "needs_user", ats: "lever", reason: "The form asks for: Describe a time you handled a difficult client.", fields, missing: fields.map((f) => f.label) };
      }
      return { status: "failed", ats: "unknown", reason: "no form" };
    }),
  };
});
// The form agent's LLM: knows the country from the résumé, refuses the open-ended Lever essay.
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class {
    async invoke(msgs: any[]) {
      const text = msgs.map((m) => m.content).join("\n");
      const answers: any[] = [];
      if (text.includes('"#country"')) answers.push({ selector: "#country", value: "Israel", confidence: 0.9 });
      return { content: JSON.stringify({ answers }) };
    }
  },
}));
vi.mock("@/app/lib/resume/tailor", async (importOriginal) => {
  const orig: any = await importOriginal();
  return { ...orig, tailorResumeToJob: vi.fn(async (input: any) => ({ tailoredResume: input.resumeStructured, fitScore: 80, matchedSkills: ["React"], missingSkills: [], keywordGaps: [], suggestions: [], changes: [] })) };
});

import User from "@/app/models/User";
import Job from "@/app/models/Job";
import Company from "@/app/models/Company";
import ExternalJobs from "@/app/models/ExternalJobs";
import Candidates from "@/app/models/Candidates";
import AutoApplication from "@/app/models/AutoApplication";
import Notification from "@/app/models/Notification";
import AgentRun from "@/app/models/AgentRun";
import { signJwt } from "@/app/lib/jwt";
import { embedAndStoreResume } from "@/app/lib/matcher/candidateProfile";
import { embedPendingJobs } from "@/app/lib/matcher/embedJobs";
import { autoApplyForUser, UNKNOWN_OUTCOME_REASON } from "@/app/lib/apply/autoApply";
import { splitName } from "@/app/lib/apply/submit";
import { startFlow, processQueue, readRun } from "@/app/lib/agents";
import { GET as settingsGET, PUT as settingsPUT } from "@/app/api/settings/auto-apply/route";
import { GET as logGET, POST as logPOST } from "@/app/api/auto-apply/route";

setupTestDb();

const O = "http://localhost";
const cookie = async (id: string) => ({ cookie: `token=${await signJwt({ id })}`, "Content-Type": "application/json" });
const j = async (res: Response) => ({ status: res.status, body: await res.json() });
const RESUME = [
  { heading: "Header", items: [{ title: "Dana Cohen", contact: ["050-0000000", "dana@test.dev"], summary: "Junior frontend developer: React, TypeScript, Next.js." }] },
  { heading: "Experience", items: [{ title: "Frontend Developer", subtitle: "Acme", dateRange: "2024 – Present", bullets: ["Built the **React** console"] }] },
];
const mkJob = (id: string, job: string, description: string, url: string) => ({ job, company: "Acme", city: "Tel Aviv", country: "Israel", url, finalUrl: url, description, skills: [], seniority: [], source: "greenhouse", sourceJobId: id, postedAt: new Date() });

let dana = "", publisher = "", gh = "", lever = "", noUrl = "", b1 = "", gh2 = "", internal = "";

beforeAll(async () => {
  await resetDb();
  dana = String((await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana Cohen", phone: "050-0000000", resumeStructured: RESUME, resumeUpdatedAt: new Date(), autoApply: { enabled: true, minScore: 60, dailyCap: 3 } } as any))._id);
  publisher = String((await User.create({ username: "rec", email: "rec@test.dev", password: "x", fullname: "Rec", phone: "0", recruiter: true } as any))._id);
  await embedAndStoreResume(dana, "Junior frontend developer: React, TypeScript, Next.js, CSS");
  const jobs = await ExternalJobs.create([
    mkJob("g1", "Junior React Developer", "React TypeScript Next.js frontend developer junior", "https://boards.greenhouse.io/acme/jobs/1"),
    mkJob("l1", "Frontend Developer React", "React TypeScript frontend developer", "https://jobs.lever.co/acme/2"),
    mkJob("x1", "React Engineer", "React TypeScript Next.js", "https://acme.example/jobs/3"),
    mkJob("b1", "Backend Engineer", "Go Kubernetes Kafka", "https://boards.greenhouse.io/acme/jobs/9"),
    mkJob("g2", "React Developer II", "React TypeScript", "https://boards.greenhouse.io/acme/jobs/10"),
  ] as any);
  [gh, lever, noUrl, b1, gh2] = jobs.map((x: any) => String(x._id));
  await embedPendingJobs(100);
  const co = await Company.create({ companyName: "Acme" } as any);
  internal = String((await Job.create({ job: "Junior Frontend (internal)", company: co._id, type: "On Site", city: "TLV", country: "Israel", publisher } as any))._id);
});

describe("autoApplyForUser", () => {
  it("applies to internal postings for real, fills external forms, hands off what needs a human, respects the daily cap", async () => {
    const r = await autoApplyForUser(dana, [
      { jobId: internal, jobModel: "Job", score: 90, title: "Junior Frontend (internal)", company: "Acme" },
      { jobId: gh, jobModel: "ExternalJobs", score: 85, title: "Junior React Developer", company: "Acme" },
      { jobId: lever, jobModel: "ExternalJobs", score: 80, title: "Frontend Developer React", company: "Acme" },
      { jobId: noUrl, jobModel: "ExternalJobs", score: 55, title: "React Engineer", company: "Acme" }, // under the bar
    ]);
    expect(r.submitted.map((s) => s.jobId)).toEqual([internal, gh]);
    expect(r.needsUser).toHaveLength(1);
    expect(r.skipped).toBe(1);
    expect(r.capped).toBe(0);
    // Real applications exist for the two submissions, none for the hand-off.
    expect(await Candidates.countDocuments({ candidateId: dana })).toBe(2);
    expect(((await Candidates.findOne({ candidateId: dana, jobId: gh })) as any).status).toBe("Submitted Resume");
    // The publisher of the internal job was notified like a manual apply.
    expect(await Notification.countDocuments({ userId: publisher, type: "application_received" })).toBe(1);
    // The form-filler got a real PDF and the split name.
    expect(submitCalls[0].profile).toMatchObject({ firstName: "Dana", lastName: "Cohen", email: "dana@test.dev" });
    expect(submitCalls[0].bytes).toBeGreaterThan(1000);
    // Greenhouse: dry run → answers (rule for the select, LLM for the country) → real submit.
    const gh1 = submitCalls.filter((c) => c.url.includes("greenhouse"));
    expect(gh1.map((c) => c.dryRun)).toEqual([true, false]);
    expect(gh1[1].answers).toEqual(expect.arrayContaining([{ selector: "#country", value: "Israel" }, { selector: "select[name='source']", value: "LinkedIn" }]));
    // Lever: the essay question has no honest answer → handed to the user with the question named.
    expect(r.needsUser[0].reason).toMatch(/difficult client/);
    const log: any[] = await AutoApplication.find({ userId: dana }).lean();
    expect(log.map((l) => l.status).sort()).toEqual(["needs_user", "submitted", "submitted"]);

    // Cap is 3/day: after the third submission the rest is held; hand-offs are never re-tried; failures don't eat the cap.
    const again = await autoApplyForUser(dana, [
      { jobId: lever, jobModel: "ExternalJobs", score: 80, title: "Frontend Developer React", company: "Acme" },
      { jobId: noUrl, jobModel: "ExternalJobs", score: 70, title: "React Engineer", company: "Acme" },
      { jobId: b1, jobModel: "ExternalJobs", score: 65, title: "Backend Engineer", company: "Acme" },
      { jobId: gh2, jobModel: "ExternalJobs", score: 62, title: "React Developer II", company: "Acme" },
    ]);
    expect(again.skipped).toBe(1); // lever: already handed off, we don't nag
    expect(again.failed).toBe(1); // noUrl host: the filler found no form
    expect(again.submitted.map((s) => s.jobId)).toEqual([b1]);
    expect(again.capped).toBe(1); // gh2 waits for tomorrow
  });

  it("does nothing when the user is opted out", async () => {
    await User.updateOne({ _id: dana }, { $set: { "autoApply.enabled": false } });
    const r = await autoApplyForUser(dana, [{ jobId: gh, jobModel: "ExternalJobs", score: 99, title: "x", company: "Acme" }]);
    expect(r.disabled).toBe(true);
    await User.updateOne({ _id: dana }, { $set: { "autoApply.enabled": true } });
  });

  it("splits names the way ATS forms expect", () => {
    expect(splitName("Maor Homri")).toEqual({ firstName: "Maor", lastName: "Homri" });
    expect(splitName("Ana Maria de Souza")).toEqual({ firstName: "Ana", lastName: "Maria de Souza" });
    expect(splitName("Cher")).toEqual({ firstName: "Cher", lastName: "Cher" });
  });
});

describe("through the bus: matcher → applier → notifier", () => {
  it("a résumé update makes the Matcher hand eligible postings to the Applier, who reports to the Notifier", async () => {
    await AutoApplication.deleteMany({ userId: dana });
    await Candidates.deleteMany({ candidateId: dana });
    const { runId } = await startFlow("resume.updated", { userId: dana }, { from: "resumeai" });
    const r = await processQueue({ runId });
    expect(r.failed).toBe(0);
    const seq = (await readRun(runId))!.messages.map((m: any) => `${m.from}→${m.to}:${m.type}`);
    expect(seq).toContain("matcher→applier:apply.request");
    expect(seq).toContain("applier→notifier:apply.report");
    const req: any = (await readRun(runId))!.messages.find((m: any) => m.type === "apply.request");
    expect(req.payload.trigger).toBe("resume_updated");
    expect(req.payload.jobs.every((x: any) => x.score >= 60)).toBe(true);
    const n: any[] = await Notification.find({ userId: dana, "meta.agent": "applier" }).lean();
    expect(n.length).toBeGreaterThanOrEqual(1);
    expect(n.map((x) => x.title).join(" ")).toMatch(/הגשנו בשבילך/);
  });

  it("new postings after a catalog refresh reach opted-in users through the same door", async () => {
    await AutoApplication.deleteMany({ userId: dana });
    await Candidates.deleteMany({ candidateId: dana });
    const since = new Date(Date.now() - 60_000).toISOString();
    const { runId } = await startFlow("jobs.normalized", { since, updatedDocs: 0, unresolved: 0 }, { from: "locator" });
    await processQueue({ runId });
    const seq = (await readRun(runId))!.messages.map((m: any) => `${m.from}→${m.to}:${m.type}:${m.status}`);
    expect(seq).toContain("matcher→applier:apply.request:done");
    const req: any = (await readRun(runId))!.messages.find((m: any) => m.type === "apply.request");
    expect(req.payload.trigger).toBe("new_postings");
  });
});

describe("routes", () => {
  it("reads and updates the opt-in; switching it on starts a run; the log lists attempts", async () => {
    await User.updateOne({ _id: dana }, { $set: { "autoApply.enabled": false } });
    const before = await AgentRun.countDocuments({ flow: "resume.updated" });
    const g = await j(await settingsGET(new NextRequest(`${O}/api/settings/auto-apply`, { headers: await cookie(dana) })));
    expect(g.body).toMatchObject({ enabled: false, hasResume: true });
    const bad = await j(await settingsPUT(new NextRequest(`${O}/api/settings/auto-apply`, { method: "PUT", headers: await cookie(dana), body: JSON.stringify({ enabled: true, minScore: 10, dailyCap: 5 }) })));
    expect(bad.status).toBe(400);
    const on = await j(await settingsPUT(new NextRequest(`${O}/api/settings/auto-apply`, { method: "PUT", headers: await cookie(dana), body: JSON.stringify({ enabled: true, minScore: 75, dailyCap: 3 }) })));
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ enabled: true, minScore: 75, dailyCap: 3 });
    expect(on.body.runId).toBeTruthy();
    expect(await AgentRun.countDocuments({ flow: "resume.updated" })).toBe(before + 1);
    const log = await j(await logGET(new NextRequest(`${O}/api/auto-apply`, { headers: await cookie(dana) })));
    expect(log.status).toBe(200);
    expect(Array.isArray(log.body.items)).toBe(true);
    const run = await j(await logPOST(new NextRequest(`${O}/api/auto-apply`, { method: "POST", headers: await cookie(dana), body: JSON.stringify({ action: "run" }) })));
    expect(run.body.runId).toBeTruthy();
    expect((await settingsGET(new NextRequest(`${O}/api/settings/auto-apply`))).status).toBe(401);
  });
});

describe("exactly-once submission (intent-then-confirm)", () => {
  let eli = "", j1 = "", j2 = "", j3 = "", j4 = "";
  const cand = (id: string, title: string) => ({ jobId: id, jobModel: "ExternalJobs" as const, score: 90, title, company: "Acme" });
  beforeAll(async () => {
    eli = String((await User.create({ username: "eli", email: "eli@test.dev", password: "x", fullname: "Eli Levi", phone: "050-1111111", resumeStructured: RESUME, resumeUpdatedAt: new Date(), autoApply: { enabled: true, minScore: 60, dailyCap: 10 } } as any))._id);
    const jobs = await ExternalJobs.create([
      mkJob("c1", "React Dev A", "React", "https://boards.greenhouse.io/acme/jobs/101"),
      mkJob("c2", "React Dev B", "React", "https://boards.greenhouse.io/acme/jobs/102"),
      mkJob("c3", "React Dev C", "React", "https://boards.greenhouse.io/acme/jobs/103"),
      mkJob("c4", "React Dev D", "React", "https://boards.greenhouse.io/acme/jobs/104"),
    ] as any);
    [j1, j2, j3, j4] = jobs.map((x: any) => String(x._id));
  });

  it("writes the claim BEFORE the submit button is pressed, then confirms it", async () => {
    let claimSeenAtClick: boolean | null = null;
    const submit = vi.fn(async (input: any) => {
      if (input.dryRun) return { status: "ready", ats: "greenhouse" };
      claimSeenAtClick = !!(await AutoApplication.exists({ userId: eli, jobId: j1, status: "submitting" }));
      return { status: "submitted", ats: "greenhouse", confirmation: "Thanks" };
    });
    const r = await autoApplyForUser(eli, [cand(j1, "React Dev A")], { submit: submit as any });
    expect(r.submitted.map((x) => x.jobId)).toEqual([j1]);
    expect(claimSeenAtClick).toBe(true);
    const row: any = await AutoApplication.findOne({ userId: eli, jobId: j1 }).lean();
    expect(row).toMatchObject({ status: "submitted", note: "Thanks" });
    expect(row.claimedAt).toBeTruthy();
    expect(await AutoApplication.countDocuments({ userId: eli, jobId: j1 })).toBe(1);
  });

  it("a claim left behind by a crash (click → no verdict) is never pressed again; the person is told to check the inbox", async () => {
    await AutoApplication.create({ userId: eli, jobId: j2, jobModel: "ExternalJobs", jobTitle: "React Dev B", company: "Acme", score: 90, status: "submitting", claimedAt: new Date(Date.now() - 60_000), url: "https://boards.greenhouse.io/acme/jobs/102" });
    const submit = vi.fn(async () => ({ status: "submitted", ats: "greenhouse" }));
    const r = await autoApplyForUser(eli, [cand(j2, "React Dev B")], { submit: submit as any });
    expect(submit).not.toHaveBeenCalled();
    expect(r.submitted).toEqual([]);
    expect(r.needsUser).toEqual([{ jobId: j2, title: "React Dev B", company: "Acme", reason: UNKNOWN_OUTCOME_REASON }]);
    const row: any = await AutoApplication.findOne({ userId: eli, jobId: j2 }).lean();
    expect(row.status).toBe("needs_user");
    expect(row.attempts).toBe(2);
    expect(row.note).toMatch(/Outcome unknown.*Not resent/);
    expect(await Candidates.countDocuments({ candidateId: eli, jobId: j2 })).toBe(0);
    // The retry after that is a plain skip: the person decides, we don't nag.
    const again = await autoApplyForUser(eli, [cand(j2, "React Dev B")], { submit: submit as any });
    expect(again).toMatchObject({ skipped: 1, needsUser: [] });
    expect(submit).not.toHaveBeenCalled();
  });

  it("a timeout AFTER the click is 'unknown', not 'failed', and is not retried", async () => {
    const submit = vi.fn(async (input: any) => (input.dryRun ? { status: "ready", ats: "greenhouse" } : { status: "failed", ats: "greenhouse", reason: "apply server timed out" }));
    const r = await autoApplyForUser(eli, [cand(j3, "React Dev C")], { submit: submit as any });
    expect(r.failed).toBe(0);
    expect(r.needsUser).toEqual([{ jobId: j3, title: "React Dev C", company: "Acme", reason: UNKNOWN_OUTCOME_REASON }]);
    const row: any = await AutoApplication.findOne({ userId: eli, jobId: j3 }).lean();
    expect(row.status).toBe("needs_user");
    expect(row.note).toMatch(/timed out after the submit step/);
    const calls = submit.mock.calls.length;
    const again = await autoApplyForUser(eli, [cand(j3, "React Dev C")], { submit: submit as any });
    expect(again.skipped).toBe(1);
    expect(submit.mock.calls.length).toBe(calls);
  });

  it("a failure BEFORE any click (server unreachable on the dry run) stays a plain failure", async () => {
    const submit = vi.fn(async () => ({ status: "failed", ats: "", reason: "apply server unreachable" }));
    const r = await autoApplyForUser(eli, [cand(j4, "React Dev D")], { submit: submit as any });
    expect(r.failed).toBe(1);
    expect(r.needsUser).toEqual([]);
    expect(((await AutoApplication.findOne({ userId: eli, jobId: j4 }).lean()) as any).status).toBe("failed");
    expect(await AutoApplication.countDocuments({ userId: eli, status: "submitting" })).toBe(0); // no claim without a click
  });
});
