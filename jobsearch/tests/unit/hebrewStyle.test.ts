import { describe, it, expect } from "vitest";
import { HEBREW_STYLE, hebrewRule } from "@/app/lib/llm/hebrew";
import { buildRerankPrompt } from "@/app/lib/matcher/rerank";
import { buildInterviewerPrompt, buildFeedbackPrompt } from "@/app/lib/interview/simulator";
import { buildTailorPrompt } from "@/app/lib/resume/tailor";
import { buildGradePrompt } from "@/app/lib/practice/grade";

const PLAN: any = { company: { summary: "", whatTheyDo: "", techStack: [], cultureHints: [] }, roleSummary: "", stages: [{ key: "hr", title: "HR", description: "", likelyQuestions: [], tips: [] }], gaps: [], questionsToAsk: [], checklist: [] };

describe("Hebrew style rule in prompts", () => {
  it("is appended whenever the output language is Hebrew and left out for English", () => {
    expect(hebrewRule("he")).toContain(HEBREW_STYLE);
    expect(hebrewRule(undefined)).toContain(HEBREW_STYLE);
    expect(hebrewRule("en")).toBe("");
    expect(HEBREW_STYLE).toMatch(/ב-Connecteam/);
    expect(HEBREW_STYLE).toMatch(/never "בConnecteam"/);

    expect(buildRerankPrompt("junior react dev", "junior", [{ _id: "1", job: "Dev", company: "Acme", description: "x" }], "he").system).toContain("HEBREW STYLE");
    expect(buildRerankPrompt("junior react dev", "junior", [{ _id: "1", job: "Dev", company: "Acme", description: "x" }], "en").system).not.toContain("HEBREW STYLE");
    const base = { plan: PLAN, stage: "hr" as const, job: { title: "Dev", company: "Acme" }, companyBrief: "b", targetQuestions: 4, transcript: [] };
    expect(buildInterviewerPrompt({ ...base, language: "he" })).toContain("HEBREW STYLE");
    expect(buildInterviewerPrompt({ ...base, language: "en" })).not.toContain("HEBREW STYLE");
    expect(buildFeedbackPrompt({ ...base, language: "he" }).system).toContain("HEBREW STYLE");
    expect(buildTailorPrompt({ job: { title: "Dev", company: "Acme", description: "x" }, resumeText: "r", language: "he" } as any).system).toContain("HEBREW STYLE");
    expect(buildTailorPrompt({ job: { title: "Dev", company: "Acme", description: "x" }, resumeText: "r", language: "en" } as any).system).not.toContain("HEBREW STYLE");
    expect(buildGradePrompt({ kind: "coding", role: "backend", level: "junior", title: "t", prompt: "p", rubric: [] }, { answer: "x" }).system).toContain("HEBREW STYLE");
  });
});
