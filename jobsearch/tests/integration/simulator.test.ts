import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

const FEEDBACK = {
  overallScore: 74,
  verdict: "lean hire",
  summary: "תשובות ענייניות, חסרות דוגמאות כמותיות.",
  dimensions: [{ name: "technical depth", score: 7, notes: "ok" }, { name: "communication", score: 8, notes: "clear" }],
  strengths: ["הסבר ברור של hooks"],
  improvements: ["להביא מספרים"],
  answerReviews: [{ question: "מה זה hook?", answerSummary: "הסבר נכון", score: 7, whatWorked: "דיוק", betterAnswer: "בפרויקט X השתמשתי ב-useEffect כדי…" }],
  nextSteps: ["לתרגל STAR"],
};
let turns = 0;
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class {
    opts: any;
    constructor(opts: any) { this.opts = opts; }
    async invoke(msgs: any[]) {
      const sys = String(msgs[0]?.content || "");
      if (this.opts.modelKwargs?.response_format) return { content: JSON.stringify(sys.includes("debrief") ? FEEDBACK : { stages: [] }) };
      // Interviewer: never coaches; wraps up after the target count.
      const target = Number(/Plan for (\d+) main questions/.exec(sys)?.[1] || 8);
      const asked = Number(/Interviewer turns so far: (\d+)/.exec(sys)?.[1] || 0);
      turns++;
      if (asked >= target) return { content: "תודה רבה, זה הכול מצידי. נחזור אליך בימים הקרובים. <<END>>" };
      return { content: asked === 0 ? "היי, אני מהנדס בכיר ב-Acme. נדבר על React — מה זה hook?" : `הבנתי. שאלה ${asked + 1}: ספר/י על באג קשה שפתרת.` };
    }
  },
}));

import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import InterviewPrep from "@/app/models/InterviewPrep";
import InterviewSession from "@/app/models/InterviewSession";
import { signJwt } from "@/app/lib/jwt";
import { buildInterviewerPrompt, buildCompanyBrief, END_MARK } from "@/app/lib/interview/simulator";
import { GET as sessGET, POST as sessPOST, PATCH as sessPATCH } from "@/app/api/interview/session/route";
import { POST as finishPOST } from "@/app/api/interview/session/finish/route";

setupTestDb();

const O = "http://localhost";
const cookie = async (id: string) => ({ cookie: `token=${await signJwt({ id })}`, "Content-Type": "application/json" });
const j = async (res: Response) => ({ status: res.status, body: await res.json() });
const PLAN = {
  company: { summary: "Acme builds cloud security.", whatTheyDo: "CNAPP", techStack: ["Go", "React"], cultureHints: ["fast"] },
  roleSummary: "Junior frontend.",
  stages: [
    { key: "hr", title: "שיחת HR", description: "", likelyQuestions: [{ question: "ספר/י על עצמך", whyAsked: "", howToAnswer: "" }], tips: [] },
    { key: "technical", title: "ראיון טכני", description: "React", likelyQuestions: [{ question: "מה זה hook?", whyAsked: "", howToAnswer: "" }], tips: [] },
  ],
  gaps: [], questionsToAsk: [], checklist: [],
};
let me = "", other = "", prepId = "";

beforeAll(async () => {
  await resetDb();
  me = String((await User.create({ username: "me", email: "me@test.dev", password: "x", fullname: "Me", phone: "0", resumeText: "Junior React developer" } as any))._id);
  other = String((await User.create({ username: "o", email: "o@test.dev", password: "x", fullname: "O", phone: "0" } as any))._id);
  const job = await ExternalJobs.create({ job: "Junior Frontend Developer", company: "Acme", city: "Tel Aviv", country: "Israel", url: "u", finalUrl: "u", description: "React", skills: [], seniority: [], source: "greenhouse", sourceJobId: "a1" } as any);
  prepId = String((await InterviewPrep.create({ userId: me, jobId: job._id, source: "external", jobTitle: "Junior Frontend Developer", company: "Acme", plan: PLAN, model: "test" }))._id);
});

describe("interviewer prompt", () => {
  it("puts the company brief, the no-feedback rule and the end token in the system prompt", () => {
    const brief = buildCompanyBrief(PLAN as any, { company: "Acme", openRoles: 3, techSignals: [{ term: "go", count: 3 }], sampleTitles: ["SRE"], websiteExcerpt: "We secure clouds." } as any);
    expect(brief).toContain("Tech stack: Go, React");
    expect(brief).toContain("Open roles right now: 3");
    expect(brief).toContain("We secure clouds.");
    const sys = buildInterviewerPrompt({ plan: PLAN as any, stage: "technical", job: { title: "Dev", company: "Acme" }, companyBrief: brief, language: "he", targetQuestions: 6, transcript: [{ role: "interviewer", content: "q1" }] });
    expect(sys).toMatch(/senior engineer on the team at Acme/);
    expect(sys).toMatch(/Do NOT evaluate, grade, coach/);
    expect(sys).toContain(END_MARK);
    expect(sys).toMatch(/Interviewer turns so far: 1/);
    expect(sys).toMatch(/OPENING/);
  });
});

describe("a full mock interview", () => {
  it("starts with the interviewer's opening, asks one question per turn, wraps up at the target, then writes the feedback once", async () => {
    turns = 0;
    const started = await j(await sessPOST(new NextRequest(`${O}/api/interview/session`, { method: "POST", headers: await cookie(me), body: JSON.stringify({ prepId, stage: "technical", questions: 3 }) })));
    expect(started.status).toBe(200);
    const s = started.body.session;
    expect(s.transcript).toHaveLength(1);
    expect(s.transcript[0].role).toBe("interviewer");
    expect(s.transcript[0].content).toMatch(/hook/);
    expect(s.asked).toBe(1);

    let last: any = null;
    for (const a of ["hook זה פונקציה…", "באג של race condition…", "עוד תשובה"]) {
      last = await j(await sessPATCH(new NextRequest(`${O}/api/interview/session`, { method: "PATCH", headers: await cookie(me), body: JSON.stringify({ sessionId: s.sessionId, answer: a }) })));
      expect(last.status).toBe(200);
    }
    expect(last.body.done).toBe(true);
    expect(last.body.message).not.toContain(END_MARK);
    expect(last.body.session.wrappedUp).toBe(true);
    // No feedback leaked mid-interview: nothing stored before finish.
    expect(((await InterviewSession.findById(s.sessionId).lean()) as any).feedback).toBeUndefined();
    // A further answer is refused.
    expect((await sessPATCH(new NextRequest(`${O}/api/interview/session`, { method: "PATCH", headers: await cookie(me), body: JSON.stringify({ sessionId: s.sessionId, answer: "עוד" }) }))).status).toBe(409);

    const fb = await j(await finishPOST(new NextRequest(`${O}/api/interview/session/finish`, { method: "POST", headers: await cookie(me), body: JSON.stringify({ sessionId: s.sessionId }) })));
    expect(fb.status).toBe(200);
    expect(fb.body.feedback.overallScore).toBe(74);
    expect(fb.body.feedback.answerReviews[0].betterAnswer).toMatch(/useEffect/);
    const again = await j(await finishPOST(new NextRequest(`${O}/api/interview/session/finish`, { method: "POST", headers: await cookie(me), body: JSON.stringify({ sessionId: s.sessionId }) })));
    expect(again.body.cached).toBe(true);

    const list = await j(await sessGET(new NextRequest(`${O}/api/interview/session?prepId=${prepId}`, { headers: await cookie(me) })));
    expect(list.body.sessions[0]).toMatchObject({ stage: "technical", status: "finished", overallScore: 74, verdict: "lean hire" });
  });

  it("lets the candidate stop early (feedback on what was answered) and keeps sessions private", async () => {
    const started = await j(await sessPOST(new NextRequest(`${O}/api/interview/session`, { method: "POST", headers: await cookie(me), body: JSON.stringify({ prepId, stage: "hr", questions: 8 }) })));
    const id = started.body.session.sessionId;
    expect((await finishPOST(new NextRequest(`${O}/api/interview/session/finish`, { method: "POST", headers: await cookie(me), body: JSON.stringify({ sessionId: id }) }))).status).toBe(400); // nothing answered yet
    await sessPATCH(new NextRequest(`${O}/api/interview/session`, { method: "PATCH", headers: await cookie(me), body: JSON.stringify({ sessionId: id, answer: "אני מפתח/ת React" }) }));
    const fb = await j(await finishPOST(new NextRequest(`${O}/api/interview/session/finish`, { method: "POST", headers: await cookie(me), body: JSON.stringify({ sessionId: id }) })));
    expect(fb.status).toBe(200);
    expect((await sessGET(new NextRequest(`${O}/api/interview/session?sessionId=${id}`, { headers: await cookie(other) }))).status).toBe(404);
    expect((await sessPOST(new NextRequest(`${O}/api/interview/session`, { method: "POST", headers: await cookie(other), body: JSON.stringify({ prepId, stage: "hr" }) }))).status).toBe(404);
    expect((await sessPOST(new NextRequest(`${O}/api/interview/session`, { method: "POST", body: JSON.stringify({ prepId }) }))).status).toBe(401);
  });
});
