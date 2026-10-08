import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

process.env.CRON_SECRET = "test-cron-secret";
process.env.TOKEN_ENCRYPTION_KEY = "test-token-encryption-key-123456";
process.env.GOOGLE_CLIENT_ID = "gid";
process.env.GOOGLE_CLIENT_SECRET = "gsecret";
delete process.env.OPENAI_API_KEY; // Locator stays rules-only; Coach is allowed by NODE_ENV=test

// Deterministic embeddings, a canned interview plan, and a scripted Scout.
vi.mock("@/app/lib/matcher/embeddings", async () => import("../setup/fakeEmbedder"));
const PLAN = {
  company: { summary: "Acme builds things.", whatTheyDo: "SaaS", techStack: ["React"], cultureHints: [] },
  roleSummary: "Junior frontend.",
  stages: [
    { key: "hr", title: "שיחת HR", description: "היכרות", likelyQuestions: [{ question: "ספר/י על עצמך", whyAsked: "פתיחה", howToAnswer: "קצר" }], tips: [] },
    { key: "technical", title: "ראיון טכני", description: "React", likelyQuestions: [{ question: "מה זה hook?", whyAsked: "יסודות", howToAnswer: "הסבר" }], tips: [] },
  ],
  gaps: [],
  questionsToAsk: ["?"],
  checklist: ["x"],
};
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class {
    async invoke() {
      return { content: JSON.stringify(PLAN) };
    }
  },
}));
const scoutCalls: any[] = [];
vi.mock("@/app/lib/scout/runScout", () => ({
  runScout: vi.fn(async (opts: any) => {
    scoutCalls.push(opts);
    const first = (opts.offset ?? 0) === 0;
    return { sources: 1, totalSources: 2, processed: 1, nextOffset: first ? 1 : null, created: first ? 2 : 1, removed: 0, results: [{ company: first ? "A" : "B", atsType: "greenhouse", fetched: 3, created: first ? 2 : 1, removed: 0 }] };
  }),
}));

import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import Candidates from "@/app/models/Candidates";
import Notification from "@/app/models/Notification";
import InterviewPrep from "@/app/models/InterviewPrep";
import AgentMessage from "@/app/models/AgentMessage";
import AgentRun from "@/app/models/AgentRun";
import { signJwt } from "@/app/lib/jwt";
import { seal } from "@/app/lib/crypto/secretBox";
import { embedAndStoreResume } from "@/app/lib/matcher/candidateProfile";
import { syncUserEmails } from "@/app/lib/email/track";
import { listAgents, startFlow, processQueue, readRun, ROUTES, AGENT_NAMES } from "@/app/lib/agents";
import { GET as tickGET } from "@/app/api/agents/tick/route";
import { GET as agentsGET, POST as agentsPOST } from "@/app/api/agents/route";
import { GET as runGET } from "@/app/api/agents/runs/[runId]/route";

setupTestDb();

const O = "http://localhost";
const cookie = async (id: string) => ({ cookie: `token=${await signJwt({ id })}`, "Content-Type": "application/json" });
const j = async (res: Response) => ({ status: res.status, body: await res.json() });
const types = async (runId: string) => (await readRun(runId))!.messages.map((m: any) => `${m.from}→${m.to}:${m.type}:${m.status}`);

let dana = "", admin = "", reactJob = "";
const mkJob = (sourceJobId: string, job: string, description: string) => ({
  job, company: "Acme", city: "Tel Aviv", country: "Israel", url: sourceJobId, finalUrl: sourceJobId, description, skills: [], seniority: [], source: "greenhouse", sourceJobId, postedAt: new Date(),
});

beforeAll(async () => {
  await resetDb();
  dana = String((await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana", phone: "0", gmail: { address: "dana@gmail.com", refreshTokenSealed: seal("refresh-123"), connectedAt: new Date() } } as any))._id);
  admin = String((await User.create({ username: "root", email: "root@test.dev", password: "x", fullname: "Root", phone: "0", admin: true } as any))._id);
  await embedAndStoreResume(dana, "Junior frontend developer: React, TypeScript, Next.js, CSS");
  const jobs = await ExternalJobs.create([
    mkJob("j1", "Junior React Developer", "React TypeScript Next.js frontend developer junior"),
    mkJob("j2", "Backend Engineer", "Go Kubernetes PostgreSQL Kafka"),
    mkJob("j3", "SRE", "Terraform AWS Kubernetes"),
  ] as any);
  reactJob = String(jobs[0]._id);
});

describe("registry", () => {
  it("has every agent registered and every message type owned by exactly one of them", () => {
    const names = listAgents().map((a) => a.name).sort();
    expect(names).toEqual([...AGENT_NAMES].sort());
    for (const [type, owner] of Object.entries(ROUTES)) {
      const agent = listAgents().find((a) => a.name === owner)!;
      expect(agent.handles, `${type} should be handled by ${owner}`).toContain(type);
    }
  });
});

describe("catalog conversation: scout → locator → matcher → notifier", () => {
  it("chunks the scout, cleans locations, embeds the new postings and runs the digest", async () => {
    const { runId } = await startFlow("catalog.refresh", { since: new Date().toISOString() }, { from: "cron", startedBy: "cron" });
    const r = await processQueue({ runId });
    expect(r.failed).toBe(0);
    expect(scoutCalls.map((c) => c.offset ?? 0)).toEqual([0, 1]); // two chunks
    expect(await types(runId)).toEqual([
      "cron→scout:catalog.refresh:done",
      "scout→scout:catalog.refresh:done",
      "scout→locator:jobs.ingested:done",
      "locator→matcher:jobs.normalized:done",
      "matcher→notifier:jobs.embedded:done",
    ]);
    const ingested: any = (await readRun(runId))!.messages.find((m: any) => m.type === "jobs.ingested");
    expect(ingested.payload).toMatchObject({ created: 3, sources: 2 }); // accumulated across chunks
    expect(await ExternalJobs.countDocuments({ embedding: { $exists: true } })).toBe(3);
    // Digest: the React job matches Dana's résumé → one job_match notification.
    const n: any[] = await Notification.find({ userId: dana, type: "job_match" }).lean();
    expect(n).toHaveLength(1);
    expect(n[0].body).toContain("Junior React Developer");
    const run: any = await AgentRun.findById(runId).lean();
    expect(run.status).toBe("done");
    expect(run.stats).toMatchObject({ messages: 5, done: 5, failed: 0 });
  });
});

describe("résumé conversation: resumeai → matcher → notifier", () => {
  it("ranks the catalog for the candidate and tells them", async () => {
    const before = await Notification.countDocuments({ userId: dana });
    const { runId } = await startFlow("resume.updated", { userId: dana }, { from: "resumeai", startedBy: `user:${dana}` });
    await processQueue({ runId });
    expect(await types(runId)).toEqual(["resumeai→matcher:resume.updated:done", "matcher→notifier:candidate.matched:done"]);
    const n: any = await Notification.findOne({ userId: dana, "meta.agent": "matcher" }).lean();
    expect(n).toBeTruthy();
    expect(n.body).toContain("Junior React Developer");
    expect(await Notification.countDocuments({ userId: dana })).toBe(before + 1);
  });
});

describe("application conversation: tracker → coach ⇄ matcher → notifier", () => {
  it("the tracker reports a status change as a new run (default publish)", async () => {
    await Candidates.create({ candidateId: dana, jobId: reactJob, jobModel: "ExternalJobs", status: "Submitted Resume" } as any);
    vi.stubGlobal("fetch", vi.fn(async (input: any) => {
      const url = typeof input === "string" ? input : input.url ?? String(input);
      if (url.includes("oauth2.googleapis.com/token")) return { ok: true, status: 200, json: async () => ({ access_token: "at" }) } as any;
      throw new Error("unexpected fetch " + url);
    }));
    const r = await syncUserEmails(dana, {
      list: async () => [{ id: "m1", from: "talent@acme.com", subject: "Technical interview", date: new Date(), snippet: "", body: "..." }],
      classify: async () => [{ id: "m1", isJobRelated: true, company: "Acme", roleTitle: "Junior React Developer", status: "Technical Interview", confidence: 0.9, summary: "ראיון טכני" }] as any,
    });
    expect(r.updated).toBe(1);
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({ userId: dana, jobId: reactJob, jobModel: "ExternalJobs", status: "Technical Interview", company: "Acme" });
    const run: any = await AgentRun.findOne({ flow: "application.changed" }).lean();
    expect(run).toBeTruthy();
    expect(run.startedBy).toBe(`user:${dana}`);
    expect(await AgentMessage.countDocuments({ runId: run._id, status: "queued" })).toBe(1);
  });

  it("the coach asks the matcher for the fit, prepares the stage and the notifier invites the candidate", async () => {
    const run: any = await AgentRun.findOne({ flow: "application.changed" }).lean();
    const r = await processQueue({ runId: String(run._id) });
    expect(r.failed).toBe(0);
    expect(await types(String(run._id))).toEqual([
      "tracker→coach:application.changed:done",
      "coach→matcher:fit.request:done",
      "matcher→coach:fit.reply:done",
      "coach→notifier:prep.ready:done",
    ]);
    const msgs = (await readRun(String(run._id)))!.messages as any[];
    const reply = msgs.find((m) => m.type === "fit.reply");
    expect(reply.replyTo).toBeTruthy();
    expect(String(reply.replyTo)).toBe(String(msgs.find((m) => m.type === "fit.request")._id));
    expect(typeof reply.payload.score).toBe("number"); // the React job has a vector
    expect(reply.payload.score).toBeGreaterThan(50);
    // The plan was generated and stored for the interview-prep page.
    const prep: any = await InterviewPrep.findOne({ userId: dana, jobId: reactJob }).lean();
    expect(prep?.plan?.stages?.map((s: any) => s.key)).toContain("technical");
    const n: any = await Notification.findOne({ userId: dana, "meta.agent": "coach" }).lean();
    expect(n.link).toBe(`/interview-prep/external/${reactJob}`);
    expect(n.title).toContain("Acme");
    expect(n.body).toContain("%");
  });

  it("does nothing for statuses without an interview stage", async () => {
    const { runId } = await startFlow("application.changed", { userId: dana, applicationId: "a", jobId: reactJob, jobModel: "ExternalJobs", status: "Rejected", title: "x", company: "Acme" }, { from: "tracker" });
    await processQueue({ runId });
    expect(await types(runId)).toEqual(["tracker→coach:application.changed:done"]);
  });
});

describe("reliability", () => {
  it("retries a failing message three times, then marks it and the run failed", async () => {
    const bad = { userId: "not-an-object-id", applicationId: "a", jobId: reactJob, jobModel: "ExternalJobs", status: "HR Phone Interview", title: "x", company: "Acme" };
    const { runId } = await startFlow("fit.request", { userId: bad.userId, jobId: reactJob, jobModel: "ExternalJobs", context: bad }, { from: "coach" });
    const r = await processQueue({ runId });
    expect(r.handled).toBe(0);
    expect(r.failed).toBe(3);
    const m: any = await AgentMessage.findOne({ runId }).lean();
    expect(m.status).toBe("failed");
    expect(m.attempts).toBe(3);
    expect(m.error).toMatch(/Cast|ObjectId/);
    expect(((await AgentRun.findById(runId).lean()) as any).status).toBe("failed");
  });

  it("claims messages atomically so two dispatchers never handle the same one", async () => {
    const { runId } = await startFlow("catalog.sweep", {}, { from: "cron" });
    const [a, b] = await Promise.all([processQueue({ runId }), processQueue({ runId })]);
    expect(a.handled + b.handled).toBe(1);
    expect(await AgentMessage.countDocuments({ runId, status: "done" })).toBe(1);
  });
});

describe("routes", () => {
  it("guards the cron tick and the admin endpoints", async () => {
    expect((await tickGET(new NextRequest(`${O}/api/agents/tick?cron_secret=nope`))).status).toBe(401);
    expect((await agentsGET(new NextRequest(`${O}/api/agents`, { headers: await cookie(dana) }))).status).toBe(403);
    expect((await agentsGET(new NextRequest(`${O}/api/agents`))).status).toBe(403);
  });

  it("lets an admin start a flow, watch it as a conversation, and the cron drain the queue", async () => {
    const started = await j(await agentsPOST(new NextRequest(`${O}/api/agents`, { method: "POST", headers: await cookie(admin), body: JSON.stringify({ flow: "catalog.sweep" }) })));
    expect(started.status).toBe(200);
    expect(started.body.runId).toBeTruthy();
    expect(started.body.handled).toBe(1);
    const conv = await j(await runGET(new NextRequest(`${O}/api/agents/runs/${started.body.runId}`, { headers: await cookie(admin) }), { params: Promise.resolve({ runId: started.body.runId }) }));
    expect(conv.body.run.status).toBe("done");
    expect(conv.body.messages[0]).toMatchObject({ from: "admin", to: "janitor", type: "catalog.sweep", status: "done" });
    expect(conv.body.messages[0].result).toMatch(/removed/);

    const list = await j(await agentsGET(new NextRequest(`${O}/api/agents`, { headers: await cookie(admin) })));
    expect(list.body.agents).toHaveLength(AGENT_NAMES.length);
    expect(list.body.runs.length).toBeGreaterThan(3);

    const tick = await j(await tickGET(new NextRequest(`${O}/api/agents/tick?cron_secret=test-cron-secret&flow=catalog.sweep&budget=5`)));
    expect(tick.status).toBe(200);
    expect(tick.body.handled).toBeGreaterThanOrEqual(1);
    expect(tick.body.remaining).toBe(0);
  });
});
