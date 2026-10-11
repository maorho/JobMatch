import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

delete process.env.OPENAI_API_KEY; // question structuring falls back to the heuristic splitter
vi.mock("@/app/lib/matcher/embeddings", async () => import("../setup/fakeEmbedder"));

import "@/app/lib/agents"; // registers every agent
import { startFlow, processQueue } from "@/app/lib/agents";
import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import Candidates from "@/app/models/Candidates";
import Notification from "@/app/models/Notification";
import ApplicationEvent from "@/app/models/ApplicationEvent";
import ApplicationOutcome from "@/app/models/ApplicationOutcome";
import InterviewQuestion from "@/app/models/InterviewQuestion";
import { signJwt } from "@/app/lib/jwt";
import { embedAndStoreResume } from "@/app/lib/matcher/candidateProfile";
import { embedPendingJobs } from "@/app/lib/matcher/embedJobs";
import { duePrompts, recordStatusChange, expireUnanswered, usersWithDuePrompts, outcomeStats, companyKey, FIRST_ASK_DAYS, QUESTIONS_ASK_DAYS, NO_REPLY_DAYS } from "@/app/lib/outcomes/outcomes";
import { questionBank, companiesWithQuestions, reportedQuestionsText, questionKey } from "@/app/lib/outcomes/questions";
import { POST as applyPOST } from "@/app/api/jobsDashboard/Candidate/externalJobApplication/route";
import { GET as outcomesGET, POST as outcomesPOST } from "@/app/api/outcomes/route";
import { GET as questionsGET, POST as questionsPOST } from "@/app/api/outcomes/questions/route";

setupTestDb();

const O = "http://localhost";
const DAY = 86_400_000;
const days = (n: number) => new Date(Date.now() + n * DAY);
const cookie = async (id: string) => ({ cookie: `token=${await signJwt({ id })}`, "Content-Type": "application/json" });
const post = async (fn: any, url: string, body: unknown, headers: Record<string, string>) => {
  const r = await fn(new NextRequest(`${O}${url}`, { method: "POST", headers, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
const RESUME = [{ heading: "Header", items: [{ title: "Dana Cohen", contact: ["dana@test.dev"], summary: "Junior React developer" }] }];
let dana = "", reactJob = "", goJob = "", appId = "";

beforeAll(async () => {
  await resetDb();
  dana = String((await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana Cohen", phone: "050", resumeStructured: RESUME, resumeUpdatedAt: new Date() } as any))._id);
  await embedAndStoreResume(dana, "Junior React developer, TypeScript, Next.js");
  const jobs = await ExternalJobs.create([
    { job: "Junior React Developer", company: "Acme Technologies Ltd", city: "Tel Aviv", country: "Israel", url: "u1", finalUrl: "u1", description: "React TypeScript Next.js junior frontend", skills: ["React"], seniority: ["junior"], source: "greenhouse", sourceJobId: "r1", postedAt: days(-2), firstSeenAt: days(-2) },
    { job: "Senior Go Engineer", company: "Globex", city: "Haifa", country: "Israel", url: "u2", finalUrl: "u2", description: "Go Kubernetes Kafka backend", skills: [], seniority: ["senior"], source: "greenhouse", sourceJobId: "g1", postedAt: days(-20), firstSeenAt: days(-20) },
  ] as any);
  [reactJob, goJob] = jobs.map((j: any) => String(j._id));
  await embedPendingJobs(10);
});

describe("outcome rows", () => {
  it("applying creates an outcome row with the matching features frozen at apply time", async () => {
    const r = await post(applyPOST, "/api/jobsDashboard/Candidate/externalJobApplication", { jobId: reactJob, status: "Submitted Resume" }, await cookie(dana));
    expect(r.status).toBe(200);
    const app: any = await Candidates.findOne({ candidateId: dana, jobId: reactJob }).lean();
    appId = String(app._id);
    const row: any = await ApplicationOutcome.findOne({ applicationId: appId }).lean();
    expect(row).toMatchObject({ outcome: "pending", reached: "none", company: "Acme Technologies Ltd", companyKey: "acme", title: "Junior React Developer", jobModel: "ExternalJobs", askCount: 0 });
    expect(row.features.level).toBe("junior");
    expect(row.features.jobSeniority).toBe("junior");
    expect(row.features.cosine).toBeGreaterThan(0);
    expect(row.features.levelFit).toBeGreaterThan(0.9);
    expect(row.features.matchScore).toBeGreaterThan(0);
    expect(row.features.postedAgeDays).toBe(2);
    expect(row.features.autoApplied).toBe(false);
    expect(companyKey("Wix.com Ltd")).toBe("wix-com");
  });

  it("asks 'did you get a reply?' only after a week, and the answer moves the application forward", async () => {
    expect((await duePrompts(dana)).replies).toEqual([]);
    const due = await duePrompts(dana, days(FIRST_ASK_DAYS + 1));
    expect(due.replies).toHaveLength(1);
    expect(due.replies[0]).toMatchObject({ applicationId: appId, company: "Acme Technologies Ltd", daysAgo: FIRST_ASK_DAYS + 1 });
    expect(due.questions).toEqual([]);

    const bad = await post(outcomesPOST, "/api/outcomes", { applicationId: appId, outcome: "maybe" }, await cookie(dana));
    expect(bad.status).toBe(400);
    const ok = await post(outcomesPOST, "/api/outcomes", { applicationId: appId, outcome: "screen" }, await cookie(dana));
    expect(ok.status).toBe(200);
    expect(ok.body.outcome).toMatchObject({ outcome: "screen", reached: "screen", firstResponseDays: 0 });
    expect(((await Candidates.findById(appId).lean()) as any).status).toBe("HR Phone Interview");
    expect(await ApplicationEvent.countDocuments({ applicationId: appId, source: "manual", status: "HR Phone Interview" })).toBe(1);
    // Resolved → no more "did you get a reply?"; "what did they ask?" comes QUESTIONS_ASK_DAYS later.
    expect((await duePrompts(dana, days(FIRST_ASK_DAYS + 1))).replies).toEqual([]);
    expect((await duePrompts(dana, days(1))).questions).toEqual([]);
    const later = await duePrompts(dana, days(QUESTIONS_ASK_DAYS + 1));
    expect(later.questions).toHaveLength(1);
    expect(later.questions[0]).toMatchObject({ applicationId: appId, stage: "hr", reached: "screen" });
  });

  it("status changes from the Gmail tracker / recruiter are mirrored; a later rejection keeps the stage reached", async () => {
    await recordStatusChange(dana, appId, "Technical Interview", "email");
    let row: any = await ApplicationOutcome.findOne({ applicationId: appId }).lean();
    expect(row).toMatchObject({ outcome: "interview", reached: "interview", source: "email" });
    await recordStatusChange(dana, appId, "Rejected", "recruiter");
    row = await ApplicationOutcome.findOne({ applicationId: appId }).lean();
    expect(row).toMatchObject({ outcome: "rejected", reached: "interview", source: "recruiter" });
    expect(row.resolvedAt).toBeTruthy();
    // Mirroring never touches Candidates (the caller already did).
    expect(((await Candidates.findById(appId).lean()) as any).status).toBe("HR Phone Interview");
    const stats = await outcomeStats(dana);
    expect(stats).toMatchObject({ total: 1, replied: 1, interviews: 1, offers: 0, rejected: 1, medianResponseDays: 0 });
  });

  it("silent applications expire to 'no reply' so the model can learn from them", async () => {
    const r = await post(applyPOST, "/api/jobsDashboard/Candidate/externalJobApplication", { jobId: goJob, status: "Submitted Resume" }, await cookie(dana));
    expect(r.status).toBe(200);
    expect(await expireUnanswered(days(NO_REPLY_DAYS - 1))).toBe(0);
    expect(await expireUnanswered(days(NO_REPLY_DAYS + 1))).toBe(1);
    const row: any = await ApplicationOutcome.findOne({ userId: dana, jobId: goJob }).lean();
    expect(row).toMatchObject({ outcome: "no_reply", source: "timeout", reached: "none" });
    expect(row.features.levelFit).toBeLessThan(0.6); // junior → senior posting
    // A "no reply" row is still asked about (they may hear back late), up to MAX_ASKS.
    expect((await duePrompts(dana, days(NO_REPLY_DAYS + 2))).replies.map((p) => p.applicationId)).toEqual([String(row.applicationId)]);
  });
});

describe("what did they ask?", () => {
  it("structures the candidate's text into questions, de-duplicates, and builds the company bank", async () => {
    const text = "ספרי על עצמך\nמה ההבדל בין useEffect ל-useLayoutEffect?\nאיך היית מתכננת state גלובלי? ציפיות שכר";
    const r = await post(questionsPOST, "/api/outcomes/questions", { applicationId: appId, stage: "technical", text }, await cookie(dana));
    expect(r.status).toBe(200);
    expect(r.body.created).toBe(4);
    expect(r.body.questions.map((q: any) => q.question)).toEqual(["ספרי על עצמך", "מה ההבדל בין useEffect ל-useLayoutEffect?", "איך היית מתכננת state גלובלי?", "ציפיות שכר"]);
    // Same report again → nothing new.
    const again = await post(questionsPOST, "/api/outcomes/questions", { applicationId: appId, stage: "technical", text }, await cookie(dana));
    expect(again.body.created).toBe(0);
    expect(await InterviewQuestion.countDocuments({ userId: dana })).toBe(4);
    expect(questionKey("  Mé ההבדל?? bin  ")).toBe("mé ההבדל bin");
    // Captured → the prompt for that stage is gone.
    const row: any = await ApplicationOutcome.findOne({ applicationId: appId }).lean();
    expect(row.questionsCaptured).toEqual(["technical"]);
    expect((await duePrompts(dana, days(30))).questions).toEqual([]);

    // A second reporter at the same company makes a question "reported 2×".
    const yoav = String((await User.create({ username: "yoav", email: "yoav@test.dev", password: "x", fullname: "Yoav", phone: "050" } as any))._id);
    const r2 = await post(questionsPOST, "/api/outcomes/questions", { company: "ACME technologies", roleTitle: "Frontend Dev", stage: "technical", text: "מה ההבדל בין useEffect ל-useLayoutEffect?\nמה זה closure?", shareable: false }, await cookie(yoav));
    expect(r2.body.created).toBe(2);

    const bank = await questionBank("Acme Technologies Ltd");
    expect(bank.total).toBe(4); // yoav's rows are private
    expect(bank.reporters).toBe(1);
    const yoavView = await questionBank("acme", { userId: yoav });
    expect(yoavView.total).toBe(5);
    expect(yoavView.questions[0]).toMatchObject({ question: "מה ההבדל בין useEffect ל-useLayoutEffect?", count: 2, stage: "technical" });
    expect(yoavView.questions[0].roleTitles).toEqual(expect.arrayContaining(["Junior React Developer", "Frontend Dev"]));

    const anon = await questionsGET(new NextRequest(`${O}/api/outcomes/questions?company=Acme%20Technologies`));
    const anonBody = await anon.json();
    expect(anonBody.gated).toBe(true);
    expect(anonBody.questions.length).toBeLessThanOrEqual(5);
    const mine = await (await questionsGET(new NextRequest(`${O}/api/outcomes/questions?company=acme`, { headers: await cookie(dana) }))).json();
    expect(mine.gated).toBe(false);
    expect(mine.total).toBe(4);

    expect((await companiesWithQuestions())[0]).toMatchObject({ companyKey: "acme", questions: 4, reporters: 1 });
    expect(await reportedQuestionsText("Acme")).toMatch(/\[technical\] ספרי על עצמך/);
    expect(await reportedQuestionsText("Nobody Inc")).toBe("");
  });

  it("skipping a stage stops the prompt", async () => {
    // Reach a new stage so a fresh prompt exists, then skip it.
    await recordStatusChange(dana, appId, "Recived an Offer", "email");
    await ApplicationOutcome.updateOne({ applicationId: appId }, { $set: { stageAt: days(-5) } });
    expect((await duePrompts(dana)).questions.map((q) => q.stage)).toEqual(["final"]);
    const r = await post(questionsPOST, "/api/outcomes/questions", { applicationId: appId, stage: "final", skip: true }, await cookie(dana));
    expect(r.body.skipped).toBe(true);
    expect((await duePrompts(dana)).questions).toEqual([]);
  });
});

describe("agents: outcomes.ask → tracker → notifier", () => {
  it("the cron flow asks each candidate once per cadence through a notification", async () => {
    // Back-date the Globex application so it is due now.
    await ApplicationOutcome.updateOne({ userId: dana, jobId: goJob }, { $set: { appliedAt: days(-10), askCount: 0 }, $unset: { askedAt: 1 } });
    expect(await usersWithDuePrompts()).toEqual([dana]);
    const { runId } = await startFlow("outcomes.ask", {}, { from: "cron" });
    const r = await processQueue({ runId, budgetMs: 20_000 });
    expect(r.failed).toBe(0);
    const notes: any[] = await Notification.find({ userId: dana, link: "/Dashboard#outcomes" }).lean();
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toMatch(/קיבלת תשובה מ-Globex\?/);
    const row: any = await ApplicationOutcome.findOne({ userId: dana, jobId: goJob }).lean();
    expect(row.askCount).toBe(1);
    expect(row.askedAt).toBeTruthy();
    // Asked → not due again until REASK_DAYS pass.
    expect(await usersWithDuePrompts()).toEqual([]);
    const { runId: run2 } = await startFlow("outcomes.ask", {}, { from: "cron" });
    await processQueue({ runId: run2, budgetMs: 20_000 });
    expect(await Notification.countDocuments({ userId: dana, link: "/Dashboard#outcomes" })).toBe(1);
    const api = await (await outcomesGET(new NextRequest(`${O}/api/outcomes`, { headers: await cookie(dana) }))).json();
    expect(api.stats.total).toBe(2);
  });
});
