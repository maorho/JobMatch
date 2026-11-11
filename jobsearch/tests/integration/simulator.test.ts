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
      if (asked === 0 && sys.includes("REAL QUESTIONS FIRST")) return { content: `היי, אני מהנדס בכיר ב-Acme. [real:${/at least (\d+) of your/.exec(sys)?.[1]}] ספר/י על עצמך.` };
      const lastAnswer = String(msgs[msgs.length - 1]?.content || "");
      if (sys.includes("CODING EXERCISE (once per interview)") && lastAnswer.includes("give me code")) return { content: "בוא/י נראה קצת קוד עכשיו — תקבל/י תרגיל קצר בעוד רגע. <<CODE_TASK>>" };
      if (lastAnswer.startsWith("[CODE SUBMITTED]")) return { content: "ראיתי את הפתרון. למה בחרת ב-Map ולא במערך?" };
      return { content: asked === 0 ? "היי, אני מהנדס בכיר ב-Acme. נדבר על React — מה זה hook?" : `הבנתי. שאלה ${asked + 1}: ספר/י על באג קשה שפתרת.` };
    }
  },
}));

import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import InterviewPrep from "@/app/models/InterviewPrep";
import InterviewSession from "@/app/models/InterviewSession";
import { signJwt } from "@/app/lib/jwt";
import { buildInterviewerPrompt, buildCompanyBrief, END_MARK, CODE_MARK, adaptiveSteer, pickStyle, FOLLOWUP_BUDGET } from "@/app/lib/interview/simulator";
import mongoose from "mongoose";
import PracticeTask from "@/app/models/PracticeTask";
import PracticeAttempt from "@/app/models/PracticeAttempt";
import { peerComparison, percentileOf } from "@/app/lib/interview/peers";
import { realQuestionsForInterview, BANK_STAGES } from "@/app/lib/interview/realQuestions";
import InterviewQuestion from "@/app/models/InterviewQuestion";
import WebInterviewQuestion from "@/app/models/WebInterviewQuestion";
import { companyKey } from "@/app/lib/outcomes/companyKey";
import { questionKey } from "@/app/lib/outcomes/questions";
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

  it("carries the interviewer's character, the stage's follow-up budget, the live read, the re-tests and the coding-exercise protocol", () => {
    const base = { plan: PLAN as any, job: { title: "Dev", company: "Acme" }, companyBrief: "b", language: "he" as const, targetQuestions: 6, transcript: [] };
    const tech = buildInterviewerPrompt({ ...base, stage: "technical", style: "probing", liveScores: [3, 4], retest: ['the question they struggled with last time (3/10): "tell me about a bug"'], codeTask: { allowed: true, done: false } });
    expect(tech).toMatch(/STYLE — skeptical and probing/);
    expect(tech).toMatch(new RegExp(`up to ${FOLLOWUP_BUDGET.technical} follow-ups`));
    expect(tech).toMatch(/LIVE READ .*\[3, 4\]/);
    expect(tech).toMatch(/STEP DOWN/);
    expect(tech).toMatch(/RE-TEST .*tell me about a bug/);
    expect(tech).toMatch(/COMPANY-ANCHORED QUESTIONS/);
    expect(tech).toContain(CODE_MARK);
    const hr = buildInterviewerPrompt({ ...base, stage: "hr", style: "dry", liveScores: [8, 9] });
    expect(hr).toMatch(/STYLE — dry and formal/);
    expect(hr).toMatch(/up to 1 follow-up /);
    expect(hr).toMatch(/STEP UP/);
    expect(hr).not.toContain(CODE_MARK);
    // The structure: company → role → "tell me about yourself", then the stage's script, with the posting's requirements to probe.
    const hrScript = buildInterviewerPrompt({ ...base, stage: "hr", jobRequirements: ["3+ years with React", "GraphQL"], jobDescription: "We build cloud security for banks." });
    expect(hrScript).toMatch(/OPENING .*\(1\) introduce yourself by name and role; \(2\) tell them about Acme[\s\S]*\(3\) present the "Dev" role[\s\S]*\(4\) ask them to tell you about themselves/);
    expect(hrScript).toMatch(/INTERVIEW SCRIPT for this stage[\s\S]*1\. Résumé walk-through[\s\S]*2\. REQUIREMENT GAPS[\s\S]*salary expectations/);
    expect(hrScript).toMatch(/REQUIREMENTS STATED IN THE POSTING: 3\+ years with React \| GraphQL/);
    expect(hrScript).toMatch(/THE ROLE AS POSTED: """We build cloud security for banks\."""/);
    expect(hrScript).toMatch(/CLARIFY WHEN NEEDED/);
    expect(tech).toMatch(/3\. Hands-on task[\s\S]*GUIDANCE IS ALLOWED HERE/);
    expect(buildInterviewerPrompt({ ...base, stage: "system_design" })).toMatch(/requirements clarification[\s\S]*what breaks at 10×/);
    expect(buildInterviewerPrompt({ ...base, stage: "behavioral" })).toMatch(/STAR: situation, task, action, result/);
    const done = buildInterviewerPrompt({ ...base, stage: "technical", codeTask: { allowed: true, done: true, title: "Two sum", score: 80 } });
    expect(done).toMatch(/CODING EXERCISE: done \("Two sum", automatic grade 80\/100\)/);
    const mid = buildInterviewerPrompt({ ...base, stage: "hr", targetQuestions: 2, transcript: [{ role: "interviewer", content: "opening" }, { role: "candidate", content: "hi" }, { role: "interviewer", content: "Tell me about a conflict you handled" }, { role: "candidate", content: "…" }, { role: "interviewer", content: "Why us?" }, { role: "candidate", content: "…" }] });
    expect(mid).toMatch(/ALREADY ASKED[\s\S]*1\. Tell me about a conflict you handled[\s\S]*2\. Why us\?/);
    expect(mid).toMatch(/BUDGET SPENT: you have asked all 2 main questions/);
    expect(buildInterviewerPrompt({ ...base, stage: "hr", transcript: [{ role: "interviewer", content: "opening" }] })).not.toMatch(/ALREADY ASKED|BUDGET SPENT/);
    expect(adaptiveSteer([7, 7]).steer).toBe("step_up");
    expect(adaptiveSteer([4, 2]).steer).toBe("step_down");
    expect(adaptiveSteer([4, 8]).steer).toBeNull();
    expect(adaptiveSteer([2]).steer).toBeNull();
    // Styles are drawn from a pool per stage: deterministic for a seed, never outside the four.
    expect(["warm", "dry", "probing", "brisk"]).toContain(pickStyle("technical", 0.1));
    expect(pickStyle("hr", 0.2)).toBe(pickStyle("hr", 0.2));
  });
});

describe("real questions from the company", () => {
  it("hands the interviewer what the company really asks (our reports + the web), stage first, and makes them mandatory", async () => {
    const key = companyKey("Acme");
    const q = (question: string, stage: string, extra: object = {}) => ({ company: "Acme", companyKey: key, stage, question, key: questionKey(question), ...extra });
    await InterviewQuestion.create([q("Explain the React reconciliation algorithm", "technical", { userId: other, roleTitle: "Frontend" }), q("Why Acme?", "hr", { userId: other })] as any);
    await WebInterviewQuestion.create([q("Design a rate limiter", "technical", { sourceUrl: "https://glassdoor.com/x", sourceName: "glassdoor.com", harvestedAt: new Date() })] as any);
    const real = await realQuestionsForInterview("Acme", "technical", { harvest: false });
    expect(real).toMatchObject({ count: 3, stageCount: 2, harvest: "skipped" });
    expect(real.text).toMatch(/REAL QUESTIONS asked at Acme \(2 reported by our own candidates/);
    expect(real.text).toMatch(/FOR THIS STAGE:[\s\S]*reconciliation[\s\S]*rate limiter \(seen on glassdoor.com\)/);
    expect(real.text).toMatch(/FROM OTHER STAGES[\s\S]*Why Acme\?/);
    expect(BANK_STAGES.system_design).toEqual(["technical"]);
    expect((await realQuestionsForInterview("Nobody Inc", "hr", { harvest: false })).count).toBe(0);

    const sys = buildInterviewerPrompt({ plan: PLAN as any, stage: "technical", job: { title: "Dev", company: "Acme" }, companyBrief: "b", language: "he", targetQuestions: 6, transcript: [], realQuestions: real });
    expect(sys).toContain(real.text);
    expect(sys).toMatch(/REAL QUESTIONS FIRST: at least 2 of your 6 main questions MUST/);
    expect(buildInterviewerPrompt({ plan: PLAN as any, stage: "hr", job: { title: "Dev", company: "Acme" }, companyBrief: "b", language: "he", targetQuestions: 6, transcript: [], realQuestions: { text: "x", count: 3, stageCount: 0 } })).toMatch(/nothing is reported for this stage yet/);

    // A session carries them (frozen) and tells the page how many it has.
    const started = await j(await sessPOST(new NextRequest(`${O}/api/interview/session`, { method: "POST", headers: await cookie(me), body: JSON.stringify({ prepId, stage: "technical", questions: 4 }) })));
    expect(started.body.session.realQuestions).toMatchObject({ count: 3, stageCount: 2 });
    expect(started.body.session.transcript[0].content).toContain("[real:2]");
    const row: any = await InterviewSession.findById(started.body.session.sessionId).select("+realQuestions.text").lean();
    expect(row.realQuestions.text).toContain("rate limiter");
    await InterviewQuestion.deleteMany({ companyKey: key });
    await WebInterviewQuestion.deleteMany({ companyKey: key });
  });
});

describe("peers", () => {
  it("ranks a score among the other candidates of the same company, one best score per person, and needs a minimum pool", async () => {
    expect(percentileOf(70, [50, 60, 80])).toBe(67);
    expect(percentileOf(60, [60, 60])).toBe(50);
    const mk = (userId: string, stage: string, score: number) => InterviewSession.create({ userId, prepId, jobId: new mongoose.Types.ObjectId(), source: "external", jobTitle: "Dev", company: "PeerCo", stage, status: "finished", transcript: [], feedback: { overallScore: score } } as any);
    const u = () => String(new mongoose.Types.ObjectId());
    const a = u(), b = u(), c = u();
    await Promise.all([mk(a, "technical", 50), mk(a, "technical", 65), mk(b, "technical", 80), mk(c, "hr", 90), mk(me, "technical", 40)]);
    const few = await peerComparison({ userId: me, company: "PeerCo", stage: "technical", score: 70 });
    expect(few.sameStage).toEqual({ n: 2, median: null, percentile: null }); // a and b (a's best = 65)
    expect(few.anyStage).toMatchObject({ n: 3, median: 80, percentile: 33 }); // 65, 80, 90 → 70 beats one of three
    expect(few.ownPrevious).toBe(0);
    await mk(u(), "technical", 55);
    const enough = await peerComparison({ userId: me, company: "PeerCo", stage: "technical", score: 70 });
    expect(enough.sameStage).toEqual({ n: 3, median: 65, percentile: 67 });
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

  it("hands out a timed coding exercise when the interviewer asks for one, and brings the graded solution back as a turn", async () => {
    await PracticeTask.create({ kind: "coding", role: "frontend", level: "junior", key: "two-sum-t", title: "Two sum", prompt: "Return the two indices…", language: "typescript", timeLimitMin: 30, createdBy: "examiner", rubric: [] } as any);
    const started = await j(await sessPOST(new NextRequest(`${O}/api/interview/session`, { method: "POST", headers: await cookie(me), body: JSON.stringify({ prepId, stage: "technical", questions: 5 }) })));
    const id = started.body.session.sessionId;
    expect(["warm", "dry", "probing", "brisk"]).toContain(started.body.session.persona);
    // Not yet: nothing open → 409.
    expect((await sessPATCH(new NextRequest(`${O}/api/interview/session`, { method: "PATCH", headers: await cookie(me), body: JSON.stringify({ sessionId: id, codeSubmitted: true }) }))).status).toBe(409);
    const handed = await j(await sessPATCH(new NextRequest(`${O}/api/interview/session`, { method: "PATCH", headers: await cookie(me), body: JSON.stringify({ sessionId: id, answer: "ok, give me code" }) })));
    expect(handed.status).toBe(200);
    expect(handed.body.message).not.toContain(CODE_MARK);
    expect(handed.body.session.codeTask).toMatchObject({ title: "Two sum", status: "open", timeLimitMin: 30 });
    const attemptId = handed.body.session.codeTask.attemptId;
    expect(((await PracticeAttempt.findById(attemptId).lean()) as any).interviewSessionId.toString()).toBe(id);
    // Still in progress on /practice → the interview waits.
    expect((await sessPATCH(new NextRequest(`${O}/api/interview/session`, { method: "PATCH", headers: await cookie(me), body: JSON.stringify({ sessionId: id, codeSubmitted: true }) }))).status).toBe(409);
    await PracticeAttempt.updateOne({ _id: attemptId }, { $set: { status: "graded", answer: "const m = new Map();", score: 80, verdict: "pass", durationSec: 600 } });
    const back = await j(await sessPATCH(new NextRequest(`${O}/api/interview/session`, { method: "PATCH", headers: await cookie(me), body: JSON.stringify({ sessionId: id, codeSubmitted: true }) })));
    expect(back.status).toBe(200);
    expect(back.body.session.codeTask).toMatchObject({ status: "done", score: 80 });
    const turns = back.body.session.transcript;
    expect(turns[turns.length - 2].content).toMatch(/^\[CODE SUBMITTED\] "Two sum" — automatic grade 80\/100 \(pass\)/);
    expect(turns[turns.length - 2].content).toContain("const m = new Map();");
    expect(turns[turns.length - 1].content).toMatch(/Map/); // the interviewer asks about the solution
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
