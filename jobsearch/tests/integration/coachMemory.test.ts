import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

// Debrief LLM: returns a progress block when the prompt carries the coach's memory.
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class {
    async invoke(msgs: any[]) {
      const sys = String(msgs[0]?.content || "");
      if (sys.includes("cluster interview-feedback")) return { content: JSON.stringify({ themes: [{ theme: "דוגמאות קונקרטיות", count: 2, status: "persistent" }, { theme: "קצב דיבור", count: 1, status: "improving" }] }) };
      if (sys.includes("reviewing one answer")) return { content: JSON.stringify({ question: "q", answerSummary: "a", score: 6, whatWorked: "w", betterAnswer: "b" }) };
      const hasMemory = sys.includes("has done mock interviews before");
      return { content: JSON.stringify({ overallScore: hasMemory ? 72 : 58, verdict: "ok", summary: "s", dimensions: [], strengths: ["ברור"], improvements: ["להביא דוגמאות קונקרטיות", hasMemory ? "לסיים משפטים" : "להאט את הקצב"], answerReviews: [], nextSteps: [], ...(hasMemory ? { progress: { note: "עלית מ-58 ל-72; עדיין חסרות דוגמאות.", improved: ["קצב דיבור"], stillOpen: ["דוגמאות קונקרטיות"] } } : {}) }) };
    }
  },
}));

import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import InterviewPrep from "@/app/models/InterviewPrep";
import InterviewSession from "@/app/models/InterviewSession";
import { signJwt } from "@/app/lib/jwt";
import { rebuildCoachMemory, memoryToText, loadCoachMemory } from "@/app/lib/interview/coachMemory";
import { generateAndStoreFeedback } from "@/app/lib/interview/feedbackJob";
import { buildInterviewerPrompt, buildFeedbackPrompt } from "@/app/lib/interview/simulator";
import { GET as progressGET } from "@/app/api/interview/progress/route";

setupTestDb();

const O = "http://localhost";
const cookie = async (id: string) => ({ cookie: `token=${await signJwt({ id })}` });
const PLAN: any = { company: { summary: "Acme", whatTheyDo: "", techStack: [], cultureHints: [] }, roleSummary: "", stages: [{ key: "hr", title: "HR", description: "", likelyQuestions: [], tips: [] }, { key: "technical", title: "Tech", description: "", likelyQuestions: [], tips: [] }], gaps: [], questionsToAsk: [], checklist: [] };
let me = "", prepId = "", jobId = "";

// Delivery metrics are recomputed from the transcript at debrief time, so the answers carry the signal.
const mkSession = (stage: string, answer: string, seconds: number) =>
  InterviewSession.create({ userId: me, prepId, jobId, source: "external", jobTitle: "Dev", company: "Acme", stage, mode: "voice", transcript: [{ role: "interviewer", content: "q1 is a long enough question" }, { role: "candidate", content: answer, seconds }] } as any);

beforeAll(async () => {
  await resetDb();
  me = String((await User.create({ username: "me", email: "me@test.dev", password: "x", fullname: "Me", phone: "0", resumeText: "Junior dev" } as any))._id);
  jobId = String((await ExternalJobs.create({ job: "Dev", company: "Acme", city: "TLV", country: "Israel", url: "u", finalUrl: "u", description: "x", skills: [], seniority: [], source: "greenhouse", sourceJobId: "a1" } as any))._id);
  prepId = String((await InterviewPrep.create({ userId: me, jobId, source: "external", jobTitle: "Dev", company: "Acme", plan: PLAN, model: "t" }))._id);
});

describe("coach memory", () => {
  it("is empty before any debrief, then remembers scores, delivery trends and themes", async () => {
    expect(await loadCoachMemory(me)).toBeNull();
    expect(memoryToText(null)).toBe("");
    // First interview: no memory in the prompt → plain debrief, memory built afterwards.
    const s1: any = await mkSession("hr", "אממ אני כאילו מפתח אממ ריאקט כאילו כבר שנתיים ובניתי אממ שלושה פרויקטים", 20); // 5 fillers in 20s
    const f1 = await generateAndStoreFeedback(String(s1._id));
    expect(f1?.overallScore).toBe(58);
    expect(f1?.progress).toBeUndefined();
    const m1 = (await loadCoachMemory(me)) as any;
    expect(m1.sessions).toBe(1);
    expect(m1.points[0]).toMatchObject({ score: 58, stage: "hr" });
    expect(m1.points[0].fillersPerMinute).toBeGreaterThan(5);
    expect(m1.trend.scoreDelta).toBeNull(); // one point, no trend
    expect(memoryToText(m1)).toMatch(/1 previous mock interview; latest score 58\/100 \(hr @ Acme\)/);

    // The interviewer and the debrief now carry the memory.
    const sys = buildInterviewerPrompt({ plan: PLAN, stage: "technical", job: { title: "Dev", company: "Acme" }, companyBrief: "", language: "he", targetQuestions: 5, transcript: [], coachMemory: memoryToText(m1) });
    expect(sys).toMatch(/WHAT THE COACH REMEMBERS.*latest score 58/);
    expect(buildFeedbackPrompt({ plan: PLAN, stage: "technical", job: { title: "Dev", company: "Acme" }, companyBrief: "", language: "he", transcript: [], coachMemory: memoryToText(m1) }).system).toMatch(/"progress"/);

    // Second interview: better delivery → trend, progress note, themes.
    const s2: any = await mkSession("technical", "אני מפתח ריאקט כבר שנתיים ובניתי שלושה פרויקטים מקצה לקצה עם TypeScript ו-Next.js ובדיקות", 25); // no fillers
    const f2 = await generateAndStoreFeedback(String(s2._id));
    expect(f2?.overallScore).toBe(72);
    expect(f2?.progress?.note).toMatch(/58 ל-72/);
    expect(f2?.progress?.stillOpen).toContain("דוגמאות קונקרטיות");
    const m2 = await rebuildCoachMemory(me, { useLLM: true });
    expect(m2.sessions).toBe(2);
    expect(m2.trend.scoreDelta).toBe(14);
    expect(m2.trend.fillersDelta).toBeLessThan(0);
    expect(typeof m2.trend.paceDelta).toBe("number");
    expect(m2.themes.map((t) => t.status)).toEqual(["persistent", "improving"]);
    expect(memoryToText(m2)).toMatch(/score trend \+14/);
    expect(memoryToText(m2)).toMatch(/filler words\/min trend -/);
    expect(memoryToText(m2)).toMatch(/recurring themes: דוגמאות קונקרטיות \(persistent, 2×\)/);

    // Deterministic fallback (no LLM) still produces themes from the raw lines.
    const m3 = await rebuildCoachMemory(me, { useLLM: false });
    expect(m3.themes[0]).toMatchObject({ theme: "להביא דוגמאות קונקרטיות", count: 2, status: "persistent" });
  });

  it("serves the memory to the signed-in user only", async () => {
    expect((await progressGET(new NextRequest(`${O}/api/interview/progress`))).status).toBe(401);
    const r = await progressGET(new NextRequest(`${O}/api/interview/progress`, { headers: await cookie(me) }));
    expect((await r.json()).memory.sessions).toBe(2);
  });
});
