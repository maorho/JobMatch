import { describe, it, expect } from "vitest";
import { HEBREW_STYLE, hebrewRule } from "@/app/lib/llm/hebrew";
import { buildRerankPrompt, applyYearsCap } from "@/app/lib/matcher/rerank";
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

    // The verdict is written in both languages at once (one cache row serves either interface), so the Hebrew rule is always on.
    const { system } = buildRerankPrompt("junior react dev", "junior", [{ _id: "1", job: "Dev", company: "Acme", description: "x" }]);
    expect(system).toContain("HEBREW STYLE");
    expect(system).toMatch(/"why": ONE plain sentence in Hebrew[\s\S]*"whyEn": the same sentence in English[\s\S]*"matched": 2–4 skills[\s\S]*"gaps": up to 3 requirements[\s\S]*\{"id","fit","why","whyEn","matched":\[\.\.\.\],"gaps":\[\.\.\.\]\}/);
    const base = { plan: PLAN, stage: "hr" as const, job: { title: "Dev", company: "Acme" }, companyBrief: "b", targetQuestions: 4, transcript: [] };
    expect(buildInterviewerPrompt({ ...base, language: "he" })).toContain("HEBREW STYLE");
    expect(buildInterviewerPrompt({ ...base, language: "en" })).not.toContain("HEBREW STYLE");
    expect(buildFeedbackPrompt({ ...base, language: "he" }).system).toContain("HEBREW STYLE");
    expect(buildTailorPrompt({ job: { title: "Dev", company: "Acme", description: "x" }, resumeText: "r", language: "he" } as any).system).toContain("HEBREW STYLE");
    expect(buildTailorPrompt({ job: { title: "Dev", company: "Acme", description: "x" }, resumeText: "r", language: "en" } as any).system).not.toContain("HEBREW STYLE");
    expect(buildGradePrompt({ kind: "coding", role: "backend", level: "junior", title: "t", prompt: "p", rubric: [] }, { answer: "x" }).system).toContain("HEBREW STYLE");
  });
});

describe("rerank: the years a posting asks for", () => {
  const dev = { _id: "1", job: "Full Stack Engineer", company: "Acme", description: "x" };
  it("tells the model the stated years and the candidate's band", () => {
    const { system, user } = buildRerankPrompt("junior react dev", "junior", [{ ...dev, experienceMin: 8 }, { ...dev, _id: "2", experienceMin: 2, experienceMax: 4 }, { ...dev, _id: "3" }, { ...dev, _id: "4", experienceMin: 2, experienceMax: 2 }]);
    expect(user).toContain("CANDIDATE (junior, 0–2 years of experience)");
    expect(user).toContain("Full Stack Engineer @ Acme — REQUIRES 8+ years");
    expect(user).toContain("Full Stack Engineer @ Acme — REQUIRES 2–4 years");
    expect(user).toContain("Full Stack Engineer @ Acme — REQUIRES 2 years");
    expect(user.match(/REQUIRES/g)).toHaveLength(3);
    expect(system).toContain("hard requirement");
  });
  it("caps the verdict and lists the years as the first gap when the posting is out of reach", () => {
    expect(applyYearsCap("junior", { experienceMin: 8 }, { fit: 82, gaps: ["Kubernetes"] })).toEqual({ fit: 30, gaps: ["8+ years", "Kubernetes"] });
    expect(applyYearsCap("junior", { experienceMin: 8 }, { fit: 82, gaps: ["8+ years of experience", "Go", "AWS"] })).toEqual({ fit: 30, gaps: ["8+ years of experience", "Go", "AWS"] });
    expect(applyYearsCap("junior", { experienceMin: 3 }, { fit: 82, gaps: [] })).toEqual({ fit: 65, gaps: ["3+ years"] });
    expect(applyYearsCap("junior", { experienceMin: 3 }, { fit: 40, gaps: [] })).toEqual({ fit: 40, gaps: [] });
    expect(applyYearsCap("junior", { experienceMin: null }, { fit: 90, gaps: [] })).toEqual({ fit: 90, gaps: [] });
    expect(applyYearsCap("senior", { experienceMin: 8 }, { fit: 90, gaps: [] })).toEqual({ fit: 90, gaps: [] });
  });
});
