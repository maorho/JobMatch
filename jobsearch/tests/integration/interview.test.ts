import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

const PLAN = {
  company: { summary: "Acme builds cloud security products.", whatTheyDo: "CNAPP", techStack: ["Go", "Kubernetes", "React"], cultureHints: ["fast-paced"] },
  roleSummary: "Junior frontend developer on the console team.",
  stages: [
    { key: "hr", title: "שיחת HR", description: "היכרות", durationHint: "30 דק'", likelyQuestions: [{ question: "ספר/י על עצמך", whyAsked: "פתיחה", howToAnswer: "קצר וממוקד", sampleAnswer: "אני..." }], tips: ["חייך/י"] },
    { key: "technical", title: "ראיון טכני", description: "React + JS", likelyQuestions: [{ question: "מה ההבדל בין let ל-const?", whyAsked: "יסודות", howToAnswer: "הסבר/י scope" }], tips: [] },
  ],
  gaps: [{ topic: "GraphQL", whyItMatters: "במשרה", studyPlan: "יומיים של מדריכים" }],
  questionsToAsk: ["איך נראה היום הראשון?"],
  checklist: ["לבדוק את הקישור לזום"],
};
const calls: string[] = [];
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class {
    opts: any;
    constructor(opts: any) { this.opts = opts; }
    async invoke(msgs: any[]) {
      calls.push(this.opts.modelName);
      const text = msgs.map((m) => m.content).join("\n");
      if (this.opts.modelKwargs?.response_format) return { content: JSON.stringify(PLAN) }; // prep
      return { content: text.includes("Let's start") ? "שלום! נתחיל: ספר/י לי על עצמך." : "משוב: טוב. השאלה הבאה: למה אצלנו?" }; // practice
    }
  },
}));

import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import InterviewPrep from "@/app/models/InterviewPrep";
import { signJwt } from "@/app/lib/jwt";
import { POST as prepPOST, GET as prepGET } from "@/app/api/interview/prep/route";
import { POST as practicePOST } from "@/app/api/interview/practice/route";
import { mineTechSignals, gatherCompanyContext } from "@/app/lib/interview/companyContext";
import { buildPrepPrompt } from "@/app/lib/interview/prepare";

setupTestDb();

const O = "http://localhost";
let me = "", other = "", jobId = "";
const cookie = async (id: string) => ({ cookie: `token=${await signJwt({ id })}`, "Content-Type": "application/json" });
const j = async (res: Response) => ({ status: res.status, body: await res.json() });

beforeAll(async () => {
  await resetDb(); // NODE_ENV is "test" under Vitest → the website fetch is skipped
  me = String((await User.create({ username: "me", email: "me@test.dev", password: "x", fullname: "Me", phone: "0", resumeText: "Junior React developer, TypeScript, Next.js" } as any))._id);
  other = String((await User.create({ username: "o", email: "o@test.dev", password: "x", fullname: "O", phone: "0" } as any))._id);
  const mk = (sourceJobId: string, job: string, description: string) => ({ job, company: "Acme", city: "Tel Aviv", country: "Israel", url: sourceJobId, finalUrl: sourceJobId, description, skills: [], seniority: [], source: "greenhouse", sourceJobId });
  const main = await ExternalJobs.create(mk("j1", "Junior Frontend Developer", "React, TypeScript, GraphQL. Kubernetes-based platform."));
  await ExternalJobs.create([mk("j2", "Backend Engineer", "Go, Kubernetes, PostgreSQL, Kafka"), mk("j3", "SRE", "Kubernetes, Terraform, AWS, Go")] as any);
  jobId = String(main._id);
});

describe("company context", () => {
  it("mines tech-stack signals from the company's postings", async () => {
    const ctx = await gatherCompanyContext("Acme", { fetchWebsite: false });
    expect(ctx.openRoles).toBe(3);
    const terms = ctx.techSignals.map((t) => t.term);
    expect(terms[0]).toBe("kubernetes"); // appears in all three postings
    expect(terms).toContain("go");
    expect(terms).toContain("react");
    expect(ctx.sampleTitles).toContain("SRE");
  });

  it("matches whole terms only", () => {
    const sig = mineTechSignals(["We love Golang and C++ and .NET; not 'gopher' or 'cpp'."]);
    expect(sig.map((s) => s.term)).toEqual(expect.arrayContaining(["golang", "c++", ".net"]));
    expect(sig.map((s) => s.term)).not.toContain("go");
  });
});

describe("POST /api/interview/prep", () => {
  it("generates a plan from the job, company context and résumé, then caches it", async () => {
    const r = await j(await prepPOST(new NextRequest(`${O}/api/interview/prep`, { method: "POST", headers: await cookie(me), body: JSON.stringify({ jobId, source: "external" }) })));
    expect(r.status).toBe(200);
    expect(r.body.cached).toBe(false);
    expect(r.body.job).toEqual({ title: "Junior Frontend Developer", company: "Acme" });
    expect(r.body.plan.stages.map((s: any) => s.key)).toEqual(["hr", "technical"]);
    expect(r.body.context.techSignals[0].term).toBe("kubernetes");
    expect(calls.filter((m) => m === "gpt-4o")).toHaveLength(1);

    const again = await j(await prepPOST(new NextRequest(`${O}/api/interview/prep`, { method: "POST", headers: await cookie(me), body: JSON.stringify({ jobId, source: "external" }) })));
    expect(again.body.cached).toBe(true);
    expect(calls.filter((m) => m === "gpt-4o")).toHaveLength(1); // no second LLM call
    expect(await InterviewPrep.countDocuments({ userId: me })).toBe(1);

    const get = await j(await prepGET(new NextRequest(`${O}/api/interview/prep?jobId=${jobId}&source=external`, { headers: await cookie(me) })));
    expect(get.body.prepId).toBe(r.body.prepId);
    expect((await prepGET(new NextRequest(`${O}/api/interview/prep?jobId=${jobId}&source=external`, { headers: await cookie(other) }))).status).toBe(404); // not theirs

    const forced = await j(await prepPOST(new NextRequest(`${O}/api/interview/prep`, { method: "POST", headers: await cookie(me), body: JSON.stringify({ jobId, source: "external", force: true }) })));
    expect(forced.body.cached).toBe(false);
    expect(calls.filter((m) => m === "gpt-4o")).toHaveLength(2);
  });

  it("validates input and auth", async () => {
    expect((await prepPOST(new NextRequest(`${O}/api/interview/prep`, { method: "POST", body: "{}" }))).status).toBe(401);
    expect((await prepPOST(new NextRequest(`${O}/api/interview/prep`, { method: "POST", headers: await cookie(me), body: JSON.stringify({ jobId: "x" }) }))).status).toBe(400);
    expect((await prepPOST(new NextRequest(`${O}/api/interview/prep`, { method: "POST", headers: await cookie(me), body: JSON.stringify({ jobId: "64b000000000000000000000" }) }))).status).toBe(404);
  });

  it("feeds the model the posting, the company signals and the résumé", () => {
    const { system, user } = buildPrepPrompt({ job: { title: "Junior Frontend Developer", company: "Acme", description: "React GraphQL" }, companyContext: { company: "Acme", openRoles: 3, techSignals: [{ term: "kubernetes", count: 3 }], sampleTitles: ["SRE"], websiteExcerpt: "Acme secures clouds" }, resumeText: "Junior React developer" });
    expect(system).toMatch(/Junior/); // level
    expect(user).toContain("kubernetes(3)");
    expect(user).toContain("Acme secures clouds");
    expect(user).toContain("Junior React developer");
  });
});

describe("POST /api/interview/practice", () => {
  it("runs a mock-interview turn for a stage of my plan", async () => {
    const prep: any = await InterviewPrep.findOne({ userId: me });
    const first = await j(await practicePOST(new NextRequest(`${O}/api/interview/practice`, { method: "POST", headers: await cookie(me), body: JSON.stringify({ prepId: String(prep._id), stage: "hr", transcript: [] }) })));
    expect(first.status).toBe(200);
    expect(first.body.reply).toContain("ספר/י");
    const second = await j(await practicePOST(new NextRequest(`${O}/api/interview/practice`, { method: "POST", headers: await cookie(me), body: JSON.stringify({ prepId: String(prep._id), stage: "hr", transcript: [{ role: "assistant", content: first.body.reply }, { role: "user", content: "אני מפתחת React" }] }) })));
    expect(second.body.reply).toContain("משוב");
    expect(calls.filter((m) => m === "gpt-4o-mini")).toHaveLength(2);
    expect((await practicePOST(new NextRequest(`${O}/api/interview/practice`, { method: "POST", headers: await cookie(other), body: JSON.stringify({ prepId: String(prep._id), stage: "hr", transcript: [] }) }))).status).toBe(404); // not their plan
  });
});
