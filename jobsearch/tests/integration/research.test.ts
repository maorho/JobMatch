import { describe, it, expect, beforeAll, vi } from "vitest";
import { setupTestDb, resetDb } from "../setup/mongo";

const BRIEF = {
  summary: "Acme makes cloud security products.",
  whatTheyDo: "CNAPP for mid-market companies",
  products: ["Acme Cloud", "Acme Scan"],
  sizeAndStage: "~400 employees, Series C (2025)",
  recentNews: [{ title: "Acme raises $80M Series C", date: "2025-09-10", source: "techcrunch.com", why: "growth, hiring" }],
  cultureSignals: ["engineering blog about Go and Kubernetes"],
  interviewProcess: "HR screen, take-home, 2 technical rounds",
  techStack: ["Go", "Kubernetes", "React"],
  talkingPoints: ["Ask about the new Scan product"],
  sources: ["https://acme.example/about", "https://techcrunch.com/acme"],
  confidence: "high",
};
// Hoisted so the `openai` mock (evaluated before this file's body) can reach it.
const { fakeClient, counter } = vi.hoisted(() => {
  const counter = { calls: 0 };
  const BRIEF_H = { summary: "Acme makes cloud security products.", whatTheyDo: "CNAPP for mid-market companies", products: ["Acme Cloud", "Acme Scan"], sizeAndStage: "~400 employees, Series C (2025)", recentNews: [{ title: "Acme raises $80M Series C", date: "2025-09-10", source: "techcrunch.com", why: "growth, hiring" }], cultureSignals: ["engineering blog about Go and Kubernetes"], interviewProcess: "HR screen, take-home, 2 technical rounds", techStack: ["Go", "Kubernetes", "React"], talkingPoints: ["Ask about the new Scan product"], sources: ["https://acme.example/about"], confidence: "high" };
  const fakeClient = { responses: { create: async (args: any) => { counter.calls++; if (args.tools) return { output_text: "Here is the brief:\n" + JSON.stringify(BRIEF_H), output: [{ type: "web_search_call" }, { type: "message" }] }; return { output_text: JSON.stringify({ ...BRIEF_H, confidence: "low" }), output: [{ type: "message" }] }; } } };
  return { fakeClient, counter };
});
vi.mock("openai", () => ({ default: class { responses = fakeClient.responses; } }));
vi.mock("@/app/lib/matcher/embeddings", async () => import("../setup/fakeEmbedder")); // the matcher's fit check needs vectors, not the real API
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class {
    async invoke() { return { content: JSON.stringify({ company: { summary: "s", whatTheyDo: "w", techStack: ["Go"], cultureHints: [] }, roleSummary: "r", stages: [{ key: "hr", title: "HR", description: "", likelyQuestions: [], tips: [] }, { key: "technical", title: "Tech", description: "", likelyQuestions: [], tips: [] }], gaps: [], questionsToAsk: [], checklist: [] }) }; }
  },
}));

import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import Candidates from "@/app/models/Candidates";
import CompanyBrief from "@/app/models/CompanyBrief";
import Notification from "@/app/models/Notification";
import InterviewPrep from "@/app/models/InterviewPrep";
import { researchCompany, researchToText, buildResearchPrompt } from "@/app/lib/interview/companyResearch";
import { buildCompanyBrief } from "@/app/lib/interview/simulator";
import { startFlow, processQueue, readRun } from "@/app/lib/agents";

setupTestDb();
process.env.OPENAI_API_KEY = "sk-test";

let dana = "", jobId = "";
beforeAll(async () => {
  await resetDb();
  dana = String((await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana", phone: "0", resumeText: "Junior Go developer" } as any))._id);
  jobId = String((await ExternalJobs.create({ job: "Junior Backend Developer", company: "Acme", city: "Tel Aviv", country: "Israel", url: "u", finalUrl: "u", description: "Go", skills: [], seniority: [], source: "greenhouse", sourceJobId: "a1", companyDomain: "acme.example" } as any))._id);
  await Candidates.create({ candidateId: dana, jobId, jobModel: "ExternalJobs", status: "Submitted Resume" } as any);
});

describe("company research agent", () => {
  it("researches with web search, caches for a week, and renders a compact brief", async () => {
    const r = await researchCompany("Acme", { domain: "acme.example", client: fakeClient as any });
    expect(r).toMatchObject({ cached: false, searched: true });
    expect(r!.brief.recentNews[0].title).toMatch(/Series C/);
    const again = await researchCompany("acme", { client: fakeClient as any }); // case-insensitive key
    expect(again!.cached).toBe(true);
    expect(counter.calls).toBe(1);
    expect(await CompanyBrief.countDocuments()).toBe(1);
    const text = researchToText(r!.brief);
    expect(text).toContain("Recent news: Acme raises $80M Series C (2025-09-10)");
    expect(text).toContain("Interview process (as reported publicly): HR screen");
    expect(text).toContain("Research confidence: high");
    expect(buildResearchPrompt("Acme", "acme.example", { openRoles: 3, techSignals: ["go"] })).toMatch(/do not guess/);
    const brief = buildCompanyBrief({ company: { summary: "s", whatTheyDo: "", techStack: [], cultureHints: [] }, roleSummary: "", stages: [], gaps: [], questionsToAsk: [], checklist: [] } as any, null, text);
    expect(brief.startsWith("RESEARCH (web):")).toBe(true);
  });

  it("falls back to prior knowledge (low confidence) when the search tool is unavailable", async () => {
    const noSearch = { responses: { create: vi.fn(async (args: any) => { if (args.tools) throw new Error("tool not available"); return { output_text: JSON.stringify({ ...BRIEF, confidence: "high" }), output: [{ type: "message" }] }; }) } };
    const r = await researchCompany("Globex", { client: noSearch as any });
    expect(r!.searched).toBe(false);
    expect(r!.brief.confidence).toBe("medium"); // never "high" without a search
    expect(noSearch.responses.create).toHaveBeenCalledTimes(2);
  });
});

describe("coach ⇄ researcher on the bus", () => {
  it("the coach asks the researcher before writing the plan, and the invitation mentions the brief", async () => {
    const { runId } = await startFlow("application.changed", { userId: dana, applicationId: "a", jobId, jobModel: "ExternalJobs", status: "Technical Interview", title: "Junior Backend Developer", company: "Acme" }, { from: "tracker" });
    const r = await processQueue({ runId });
    expect(r.failed).toBe(0);
    expect((await readRun(runId))!.messages.map((m: any) => `${m.from}→${m.to}:${m.type}:${m.status}`)).toEqual([
      "tracker→coach:application.changed:done",
      "coach→matcher:fit.request:done",
      "matcher→coach:fit.reply:done",
      "coach→researcher:research.request:done",
      "researcher→coach:research.reply:done",
      "coach→notifier:prep.ready:done",
    ]);
    const reply: any = (await readRun(runId))!.messages.find((m: any) => m.type === "research.reply");
    expect(reply.payload).toMatchObject({ company: "Acme", confidence: "high", headline: expect.stringMatching(/Series C/) });
    expect(reply.replyTo).toBeTruthy();
    expect(await InterviewPrep.countDocuments({ userId: dana })).toBe(1);
    const n: any = await Notification.findOne({ userId: dana, "meta.agent": "coach" }).lean();
    expect(n.link).toBe(`/interview-prep/external/${jobId}`);
  });
});
