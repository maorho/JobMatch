import { describe, it, expect, beforeAll, vi } from "vitest";
import { setupTestDb, resetDb } from "../setup/mongo";

// Fake Responses client: the first (search) call answers with prose around JSON; a repair call returns clean JSON.
const { fakeClient, counter } = vi.hoisted(() => {
  const counter = { calls: 0, repairs: 0 };
  const FOUND = {
    questions: [
      { question: "Tell me about a project you are proud of", stage: "hr", topic: "background", roleTitle: "Junior Developer", sourceUrl: "https://www.glassdoor.com/Interview/Acme-Interview-Questions-E1.htm", sourceName: "glassdoor.com" },
      { question: "Implement an LRU cache", stage: "technical", topic: "data structures", roleTitle: "", sourceUrl: "https://www.reddit.com/r/cscareerquestions/acme", sourceName: "reddit.com" },
      { question: "implement an lru cache!", stage: "technical", topic: "", roleTitle: "", sourceUrl: "https://blind.example/acme", sourceName: "" },
      { question: "Why Acme?", stage: "final", topic: "motivation", roleTitle: "", sourceUrl: "", sourceName: "" },
      { question: "מה הציפיות שלך לשכר?", stage: "hr", topic: "salary", roleTitle: "", sourceUrl: "https://example.co.il/acme", sourceName: "" },
    ],
    processNotes: "HR screen, a take-home, then two technical rounds.",
  };
  const fakeClient = {
    responses: {
      create: async (args: any) => {
        counter.calls++;
        if (args.tools) return { output_text: "Here is what I found:\n```json\n" + JSON.stringify(FOUND) + "\n```", output: [{ type: "web_search_call" }, { type: "message" }] };
        counter.repairs++;
        return { output_text: JSON.stringify(FOUND), output: [{ type: "message" }] };
      },
    },
  };
  return { fakeClient, counter };
});
vi.mock("openai", () => ({ default: class { responses = fakeClient.responses; } }));

import User from "@/app/models/User";
import WebInterviewQuestion, { WebQuestionHarvest } from "@/app/models/WebInterviewQuestion";
import { harvestWebQuestions, ensureWebQuestions, webQuestionsDue, buildWebQuestionsPrompt } from "@/app/lib/interview/webQuestions";
import { captureInterviewQuestions, questionBank, companiesWithQuestions, reportedQuestionsText } from "@/app/lib/outcomes/questions";
import { splitForReader } from "@/app/interview-questions/[company]/page";

setupTestDb();

let dana = "";
beforeAll(async () => {
  await resetDb();
  dana = String((await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana", phone: "0" } as any))._id);
});

describe("web interview questions harvest", () => {
  it("searches once, stores distinct questions with provenance, and is cached for a month", async () => {
    expect(await webQuestionsDue("Acme Ltd")).toBe(true);
    const r = await harvestWebQuestions("Acme Ltd", { domain: "acme.example", sampleTitles: ["Junior Developer"], client: fakeClient as any });
    expect(r).toMatchObject({ companyKey: "acme", searched: true, cached: false, found: 4, created: 4 }); // the two LRU spellings collapse into one
    expect(r!.processNotes).toMatch(/take-home/);
    expect(await WebInterviewQuestion.countDocuments({ companyKey: "acme" })).toBe(4);
    const lru: any = await WebInterviewQuestion.findOne({ companyKey: "acme", stage: "technical" }).lean();
    expect(lru.sourceName).toBe("reddit.com");
    const he: any = await WebInterviewQuestion.findOne({ companyKey: "acme", topic: "salary" }).lean();
    expect(he.language).toBe("he");
    expect(he.sourceName).toBe("example.co.il"); // host derived from the URL when the model left the name empty

    const again = await harvestWebQuestions("acme", { client: fakeClient as any });
    expect(again!.cached).toBe(true);
    expect(counter.calls).toBe(1); // no second search inside the TTL
    expect(await webQuestionsDue("Acme")).toBe(false);
    expect(await WebQuestionHarvest.countDocuments()).toBe(1);
    expect(buildWebQuestionsPrompt("Acme", { domain: "acme.example" })).toMatch(/Never invent/);
  });

  it("returns null without a client (tests / no key) instead of throwing", async () => {
    expect(await harvestWebQuestions("Nobody Inc")).toBeNull();
    expect(await ensureWebQuestions("Nobody Inc")).toBeNull();
  });

  it("merges with candidates' own reports: same question → one row with both provenances; ours sort first", async () => {
    await captureInterviewQuestions({ userId: dana, company: "Acme", roleTitle: "Junior Developer", stage: "technical", text: "Implement an LRU cache?\nWhat is a closure?" });
    const bank = await questionBank("Acme");
    expect(bank).toMatchObject({ total: 5, reported: 2, reporters: 1, webCount: 3 });
    const lru = bank.questions.find((q) => /lru/i.test(q.question))!;
    expect(lru).toMatchObject({ count: 1, web: 1 });
    expect(lru.sources[0].name).toBe("reddit.com");
    expect(bank.questions.slice(0, 2).every((q) => q.count > 0)).toBe(true); // our candidates' reports lead
    expect(bank.questions.filter((q) => q.count === 0).every((q) => q.web >= 1)).toBe(true);

    const text = await reportedQuestionsText("Acme", { limit: 10 });
    expect(text).toMatch(/\[technical · data structures\] Implement an LRU cache/);
    expect(text).toMatch(/Tell me about a project you are proud of \(seen on glassdoor.com\)/);

    const groups = splitForReader(bank.questions, false);
    expect(groups.map((g) => g.stage)).toEqual(["hr", "technical", "final"]);

    const companies = await companiesWithQuestions();
    expect(companies).toHaveLength(1);
    expect(companies[0]).toMatchObject({ companyKey: "acme", questions: 5, reported: 2, web: 3, reporters: 1 });
  });

  it("a company with only web questions is listed too", async () => {
    await harvestWebQuestions("Globex", { client: fakeClient as any });
    const companies = await companiesWithQuestions();
    expect(companies.map((c) => c.companyKey)).toEqual(["acme", "globex"]); // ours-first ordering
    const bank = await questionBank("Globex");
    expect(bank).toMatchObject({ company: "Globex", total: 4, reported: 0, reporters: 0, webCount: 4 });
  });
});
