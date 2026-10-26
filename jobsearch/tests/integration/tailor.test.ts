import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

// The tailoring agent's LLM, replaced by a canned (valid) answer.
const CANNED = {
  tailoredResume: [
    { heading: "Header", items: [{ title: "Dana Dev", subtitle: "Junior Frontend Developer", summary: "React developer targeting junior roles.", bullets: [] }] },
    { heading: "Skills", items: [{ title: "Technical Skills", bullets: ["React", "TypeScript"] }] },
  ],
  fitScore: 71.6,
  matchedSkills: ["React", "TypeScript"],
  missingSkills: ["GraphQL"],
  keywordGaps: ["CI/CD"],
  suggestions: ["הדגש/י את פרויקט ה-React בראש הקו\"ח"],
  changes: ["Moved the React project to the top"],
};
let lastPrompt = "";
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class {
    async invoke(msgs: any[]) {
      lastPrompt = msgs.map((m) => m.content).join("\n");
      return { content: "```json\n" + JSON.stringify(CANNED) + "\n```" };
    }
  },
}));

import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import { signJwt } from "@/app/lib/jwt";
import { POST } from "@/app/api/chat/tailor-resume/route";
import { structuredToText } from "@/app/lib/resume/structuredToText";
import { extractJson, buildTailorPrompt } from "@/app/lib/resume/tailor";

setupTestDb();

let jobId = "";
let withResume = "";
let withoutResume = "";
const call = async (body: object, userId?: string) => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userId) headers.cookie = `token=${await signJwt({ id: userId })}`;
  const res = await POST(new NextRequest("http://localhost/api/chat/tailor-resume", { method: "POST", headers, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};

beforeAll(async () => {
  await resetDb();
  const job = await ExternalJobs.create({ job: "Junior Frontend Developer", company: "Acme", city: "Tel Aviv", country: "Israel", url: "u", finalUrl: "u", description: "React, TypeScript, GraphQL, CI/CD", skills: [], seniority: [], source: "greenhouse", sourceJobId: "j1" } as any);
  jobId = String(job._id);
  const u1 = await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana Dev", phone: "0", resumeText: "Dana Dev — React, TypeScript, Next.js. Built web apps." } as any);
  withResume = String(u1._id);
  const u2 = await User.create({ username: "nores", email: "nores@test.dev", password: "x", fullname: "No Resume", phone: "0" } as any);
  withoutResume = String(u2._id);
});

describe("POST /api/chat/tailor-resume", () => {
  it("requires a session and a valid job", async () => {
    expect((await call({ jobId })).status).toBe(401);
    expect((await call({ jobId: "nope" }, withResume)).status).toBe(400);
    expect((await call({ jobId: "64b000000000000000000000" }, withResume)).status).toBe(404);
  });

  it("tells users without a résumé to build one first", async () => {
    const r = await call({ jobId }, withoutResume);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("NO_RESUME");
  });

  it("returns the tailored résumé and fit analysis, feeding the LLM the job and the résumé", async () => {
    const r = await call({ jobId, source: "external", language: "he" }, withResume);
    expect(r.status).toBe(200);
    expect(r.body.job).toEqual({ title: "Junior Frontend Developer", company: "Acme" });
    expect(r.body.fitScore).toBe(72); // rounded
    expect(r.body.missingSkills).toEqual(["GraphQL"]);
    expect(r.body.tailoredResume[0].heading).toBe("Header");
    expect(lastPrompt).toContain("GraphQL, CI/CD"); // job description reached the model
    expect(lastPrompt).toContain("Next.js"); // résumé reached the model
    expect(lastPrompt).toMatch(/Never invent/);
  });
});

describe("résumé helpers", () => {
  it("flattens a structured résumé into embeddable text", () => {
    const t = structuredToText(CANNED.tailoredResume);
    expect(t).toContain("HEADER");
    expect(t).toContain("Dana Dev — Junior Frontend Developer");
    expect(t).toContain("• React");
    expect(structuredToText("nope")).toBe("");
  });

  it("extracts JSON from fenced or chatty replies and rejects garbage", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! {"a":1} hope this helps')).toEqual({ a: 1 });
    expect(() => extractJson("no json here")).toThrow();
  });

  it("prefers the structured résumé over raw text when both exist", () => {
    const { user } = buildTailorPrompt({ resumeStructured: CANNED.tailoredResume, resumeText: "RAW TEXT", job: { title: "X", company: "Y", description: "Z" } });
    expect(user).toContain("Dana Dev");
    expect(user).not.toContain("RAW TEXT");
  });
});
