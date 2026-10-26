import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

// The model call is stubbed: the test is about auth, the résumé guard, caching and placeholder counting.
const invoke = vi.fn();
vi.mock("@langchain/openai", () => ({ ChatOpenAI: class { invoke = invoke; } }));

import User from "@/app/models/User";
import SuggestedAnswer from "@/app/models/SuggestedAnswer";
import UsageCounter from "@/app/models/UsageCounter";
import { signJwt, sessionClaims } from "@/app/lib/jwt";
import { POST } from "@/app/api/interview/questions/answer/route";

setupTestDb();

let token = "", noResumeToken = "", dana = "";
const call = (body: unknown, t = token) => POST(new NextRequest("http://localhost/api/interview/questions/answer", { method: "POST", body: JSON.stringify(body), headers: { cookie: `token=${t}`, "Content-Type": "application/json" } } as any));

beforeAll(async () => {
  await resetDb();
  process.env.OPENAI_API_KEY = "test-key-not-used";
  const u: any = await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana", phone: "0", resumeText: "Junior frontend developer. Built a React + TypeScript dashboard at Acme (2025) that cut report time by 40%.", resumeUpdatedAt: new Date("2026-10-01") } as any);
  dana = String(u._id);
  token = await signJwt(sessionClaims(u));
  const n: any = await User.create({ username: "noam", email: "noam@test.dev", password: "x", fullname: "Noam", phone: "0" } as any);
  noResumeToken = await signJwt(sessionClaims(n));
});

describe("POST /api/interview/questions/answer", () => {
  it("requires a session and a question", async () => {
    expect((await call({ company: "Acme", question: "Tell me about a hard bug" }, "")).status).toBe(401);
    expect((await call({ company: "Acme", question: "x" })).status).toBe(400);
  });

  it("asks for a résumé first", async () => {
    const res = await call({ company: "Acme", question: "Tell me about a hard bug you fixed" }, noResumeToken);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("NO_RESUME");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("drafts from the résumé, counts placeholders, caches per résumé version, charges the quota once", async () => {
    invoke.mockResolvedValueOnce({ content: JSON.stringify({ answer: "At Acme I built a React dashboard that cut report time by 40%. [add: how many users relied on it]", tips: ["Lead with the number."] }) });
    const first = await (await call({ company: "Acme", question: "Tell me about a project you are proud of", stage: "technical" })).json();
    expect(first).toMatchObject({ ok: true, cached: false, placeholders: 1, tips: ["Lead with the number."] });
    expect(first.answer).toMatch(/40%/);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(await SuggestedAnswer.countDocuments({ userId: dana })).toBe(1);

    const second = await (await call({ company: "acme", question: "Tell me about a project you are proud of" })).json(); // same key: company is case-insensitive
    expect(second).toMatchObject({ ok: true, cached: true, placeholders: 1 });
    expect(invoke).toHaveBeenCalledTimes(1); // no second model call, no second quota charge

    // A new résumé version gets a fresh answer.
    await User.updateOne({ _id: dana }, { $set: { resumeUpdatedAt: new Date("2026-10-20") } });
    invoke.mockResolvedValueOnce({ content: JSON.stringify({ answer: "Updated answer.", tips: [] }) });
    const third = await (await call({ company: "Acme", question: "Tell me about a project you are proud of" })).json();
    expect(third).toMatchObject({ ok: true, cached: false, answer: "Updated answer." });
    expect(await SuggestedAnswer.countDocuments({ userId: dana })).toBe(2);
  });

  it("turns a spent quota into a 429 before calling the model", async () => {
    process.env.QUOTA_ENFORCE_IN_TESTS = "1";
    process.env.QUOTA_QUESTION_ANSWER = "0";
    try {
      const calls = invoke.mock.calls.length;
      const res = await call({ company: "Acme", question: "Why do you want to work here?" });
      expect(res.status).toBe(429);
      expect(invoke).toHaveBeenCalledTimes(calls);
    } finally {
      delete process.env.QUOTA_ENFORCE_IN_TESTS;
      delete process.env.QUOTA_QUESTION_ANSWER;
      await UsageCounter.deleteMany({});
    }
  });
});
