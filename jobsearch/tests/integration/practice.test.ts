import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

vi.mock("@/app/lib/matcher/embeddings", async () => import("../setup/fakeEmbedder"));

import User from "@/app/models/User";
import PracticeTask from "@/app/models/PracticeTask";
import PracticeAttempt from "@/app/models/PracticeAttempt";
import Notification from "@/app/models/Notification";
import { signJwt } from "@/app/lib/jwt";
import { codingMinutes, assignmentHours, inferRole } from "@/app/lib/practice/roles";
import { ensureTasks, buildAuthorPrompt, authorTasks } from "@/app/lib/practice/author";
import { weightedScore, heuristicVerdict, gradeWithModel, buildGradePrompt, LATE_GRACE_SEC } from "@/app/lib/practice/grade";
import { tasksFor, startAttempt, submitAttempt, listAttempts, suggestRoleAndLevel } from "@/app/lib/practice/attempts";
import { readRun, listAgents } from "@/app/lib/agents";
import AgentRun from "@/app/models/AgentRun";
import { GET as tasksGET } from "@/app/api/practice/tasks/route";
import { POST as attemptsPOST } from "@/app/api/practice/attempts/route";
import { GET as attemptGET } from "@/app/api/practice/attempts/[id]/route";
import { POST as submitPOST } from "@/app/api/practice/attempts/[id]/submit/route";

setupTestDb();

let dana = "";
let token = "";
beforeAll(async () => {
  await resetDb();
  dana = String((await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana", phone: "0", resumeText: "Junior frontend developer, React, TypeScript, CSS. 1 year experience.", currentJob: "Frontend Developer" } as any))._id);
  token = await signJwt({ id: dana });
});
const authed = (url: string, init: RequestInit = {}) => new NextRequest(`http://localhost${url}`, { ...init, headers: { cookie: `token=${token}`, "Content-Type": "application/json", ...(init.headers || {}) } } as any);

describe("practice platform: roles and clocks", () => {
  it("gives each role × level its own clock and infers the role from a résumé", () => {
    expect(codingMinutes("frontend", "junior")).toBe(30);
    expect(codingMinutes("data", "senior")).toBe(70);
    expect(assignmentHours("backend", "mid")).toBe(6);
    expect(assignmentHours("devops", "senior")).toBe(10);
    expect(inferRole("Kubernetes and Terraform, CI/CD pipelines, SRE on-call")).toBe("devops");
    expect(inferRole("pandas, scikit-learn, statistics, machine learning models")).toBe("data");
    expect(inferRole("React, Node.js, full stack developer")).toBe("fullstack");
    expect(inferRole("")).toBe("frontend");
  });

  it("both agents are on the bus with their own message types", () => {
    const names = listAgents().map((a) => a.name);
    expect(names).toContain("examiner");
    expect(names).toContain("assigner");
    expect(listAgents().find((a) => a.name === "examiner")!.handles).toEqual(["coding.author", "coding.grade"]);
    expect(listAgents().find((a) => a.name === "assigner")!.handles).toEqual(["assignment.author", "assignment.review"]);
  });
});

describe("authoring", () => {
  it("falls back to the built-in seeds without a model, scaled to the level, and never duplicates", async () => {
    const r = await ensureTasks("coding", "frontend", "junior");
    expect(r).toMatchObject({ before: 0, added: 2, source: "seed" }); // frontend ships two coding seeds
    const again = await ensureTasks("coding", "frontend", "junior");
    expect(again.added).toBe(0);
    const t: any = await PracticeTask.findOne({ kind: "coding", role: "frontend", level: "junior" }).lean();
    expect(t.timeLimitMin).toBe(30);
    expect(t.createdBy).toBe("examiner");
    expect(t.rubric.length).toBeGreaterThanOrEqual(3);
    const a = await ensureTasks("assignment", "frontend", "senior");
    expect(a).toMatchObject({ added: 1, source: "seed" });
    const h: any = await PracticeTask.findOne({ kind: "assignment", role: "frontend", level: "senior" }).lean();
    expect(h.estimatedHours).toBe(8);
    expect(h.createdBy).toBe("assigner");
    expect(buildAuthorPrompt("coding", "backend", "mid", 2, ["LRU Cache"]).user).toMatch(/Avoid these topics.*LRU Cache/);
    expect(buildAuthorPrompt("assignment", "data", "junior", 1, []).system).toMatch(/Assigner/);
  });

  it("authors with a model when one is injected (validated JSON, bad entries dropped)", async () => {
    const client = { invoke: async () => ({ content: JSON.stringify({ tasks: [{ title: "Top-K words", prompt: "נתון טקסט ארוך. החזירו את K המילים הנפוצות ביותר.\n\nשורה שנייה.", language: "python", examples: [{ input: "'a a b', k=1", output: "['a']" }], rubric: [{ criterion: "נכונות", weight: 4 }, { criterion: "סיבוכיות", weight: 2 }], tags: ["hash map"], difficulty: 2 }, { title: "x", prompt: "too short" }] }) }) };
    const tasks = await authorTasks("coding", "data", "junior", 2, { client });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Top-K words");
    const r = await ensureTasks("coding", "data", "junior", { client, min: 1 });
    expect(r).toMatchObject({ added: 1, source: "llm" });
  });
});

describe("grading", () => {
  it("weights the rubric and the heuristic penalises late / empty work", async () => {
    expect(weightedScore([{ criterion: "a", score: 100 }, { criterion: "b", score: 50 }], [{ criterion: "a", weight: 3 }, { criterion: "b", weight: 1 }])).toBe(88);
    const task = { kind: "coding", rubric: [{ criterion: "נכונות", weight: 4 }], deliverables: [] };
    expect(heuristicVerdict(task, { answer: "" }).score).toBe(0);
    const ok = heuristicVerdict(task, { answer: "function twoSum(nums, t) { const m = new Map(); // O(n)\n return [0,1]; }" });
    expect(ok.score).toBeGreaterThanOrEqual(55);
    expect(heuristicVerdict(task, { answer: "function f() {}", timedOut: true }).score).toBeLessThan(ok.score);
    expect(await gradeWithModel(task, { answer: "x" })).toBeNull(); // no model under test
  });

  it("the model grader fills a missing criterion with the mean and the prompt carries the rubric", async () => {
    const task = { kind: "coding", role: "frontend", level: "junior", title: "T", prompt: "P", rubric: [{ criterion: "נכונות", weight: 4 }, { criterion: "קריאות", weight: 1 }], examples: [], constraints: [], timeLimitMin: 30 };
    const client = { invoke: async () => ({ content: JSON.stringify({ breakdown: [{ criterion: "נכונות", score: 80, comment: "עובד" }], feedback: "טוב", strengths: ["ברור"], improvements: [], verdict: "pass" }) }) };
    const v = await gradeWithModel(task, { answer: "code", durationSec: 600 }, client);
    expect(v!.breakdown).toHaveLength(2);
    expect(v!.score).toBe(80);
    expect(buildGradePrompt(task, { answer: "code", timedOut: true }).user).toMatch(/AFTER the time limit/);
    expect(buildGradePrompt(task, { answer: "code" }).user).toMatch(/נכונות \(weight 4\)/);
  });
});

describe("attempt lifecycle through the agents", () => {
  it("start → clock → submit → Examiner grades on the bus → Notifier tells the candidate", async () => {
    const suggested = await suggestRoleAndLevel(dana);
    expect(suggested).toEqual({ role: "frontend", level: "junior" });
    const tasks = await tasksFor("frontend", "junior"); // authors the missing assignment through the bus
    expect(tasks.filter((t) => t.kind === "coding")).toHaveLength(2);
    expect(tasks.filter((t) => t.kind === "assignment")).toHaveLength(1);
    const authoring: any[] = await AgentRun.find({ title: /Home assignments: frontend\/junior/ }).lean();
    expect(authoring).toHaveLength(1);

    const coding = tasks.find((t) => t.kind === "coding")!;
    const a = await startAttempt(dana, String(coding._id));
    expect(new Date(a.deadlineAt).getTime() - new Date(a.startedAt).getTime()).toBe(30 * 60_000);
    expect(String((await startAttempt(dana, String(coding._id)))._id)).toBe(String(a._id)); // same open attempt
    expect((await PracticeTask.findById(coding._id).lean() as any).stats.attempts).toBe(1);

    const graded = await submitAttempt(dana, String(a._id), { answer: "export function twoSum(nums: number[], target: number) {\n  const seen = new Map<number, number>(); // O(n)\n  for (let i = 0; i < nums.length; i++) { const j = seen.get(target - nums[i]); if (j !== undefined) return [j, i]; seen.set(nums[i], i); }\n  return [0, 0];\n}" });
    expect(graded).toMatchObject({ status: "graded", timedOut: false, gradedBy: "examiner", model: "heuristic", verdict: expect.any(String) });
    expect(graded.score).toBeGreaterThanOrEqual(55);
    expect(graded.breakdown.length).toBeGreaterThanOrEqual(3);
    const run: any = await AgentRun.findOne({ title: /Grade: frontend\/junior/ }).lean();
    const r = (await readRun(String(run._id)))!;
    expect(r.messages.map((m: any) => `${m.from}→${m.to}:${m.type}:${m.status}`)).toEqual(["user→examiner:coding.grade:done", "examiner→notifier:practice.graded:done"]);
    const n: any = await Notification.findOne({ userId: dana, "meta.agent": "examiner" }).lean();
    expect(n.link).toBe(`/practice/${a._id}`);
    expect(n.title).toMatch(/הבוחן בדק/);
    expect(await submitAttempt(dana, String(a._id), { answer: "again" })).toMatchObject({ status: "graded", answer: expect.not.stringMatching(/^again$/) }); // idempotent
  });

  it("a take-home handed in after the window is flagged late, reviewed by the Assigner", async () => {
    const [task]: any[] = await PracticeTask.find({ kind: "assignment", role: "frontend", level: "junior" }).lean();
    const a = await startAttempt(dana, String(task._id));
    expect(new Date(a.deadlineAt).getTime() - new Date(a.startedAt).getTime()).toBe(4 * 3_600_000);
    await PracticeAttempt.updateOne({ _id: a._id }, { $set: { deadlineAt: new Date(Date.now() - (LATE_GRACE_SEC + 5) * 1000) } });
    const graded = await submitAttempt(dana, String(a._id), { answer: "בניתי אפליקציית React עם קומפוננטות מופרדות, state ב-URL, ו-3 בדיקות ב-Testing Library. README מסביר איך מריצים. עם עוד יום הייתי מוסיף virtualization.", repoUrl: "https://github.com/dana/job-board" });
    expect(graded).toMatchObject({ status: "graded", timedOut: true, gradedBy: "assigner" });
    const n: any = await Notification.findOne({ userId: dana, "meta.agent": "assigner" }).lean();
    expect(n.title).toMatch(/עבודת הבית/);
    const mine = await listAttempts(dana);
    expect(mine.stats).toMatchObject({ total: 2, graded: 2, passed: expect.any(Number) });
    expect(mine.attempts[0].task.title).toBe(task.title);
    expect(mine.attempts[0]).not.toHaveProperty("answer");
  });

  it("the API: catalogue for my role, start, read (hints hidden while open), submit", async () => {
    const list = await (await tasksGET(authed("/api/practice/tasks"))).json();
    expect(list).toMatchObject({ role: "frontend", level: "junior" });
    expect(list.coding.length).toBe(2);
    expect(list.coding[0].best).toBeGreaterThanOrEqual(55); // the graded attempt from above
    expect(list.roles.find((r: any) => r.key === "data").codingMinutes).toBe(35);
    const other = await (await tasksGET(authed("/api/practice/tasks?role=qa&level=mid"))).json(); // seeds another role on demand
    expect(other.coding.length).toBeGreaterThanOrEqual(2);
    expect(other.assignments.length).toBe(1);

    const started = await (await attemptsPOST(authed("/api/practice/attempts", { method: "POST", body: JSON.stringify({ taskId: list.coding[0]._id }) }))).json(); // the seed with hints; a second attempt on a graded task is allowed
    expect(started.ok).toBe(true);
    const read = await (await attemptGET(authed(`/api/practice/attempts/${started.attemptId}`), { params: Promise.resolve({ id: started.attemptId }) })).json();
    expect(read.attempt.status).toBe("in_progress");
    expect(read.task.hints).toEqual([]); // hidden while the clock runs
    const sub = await (await submitPOST(authed(`/api/practice/attempts/${started.attemptId}/submit`, { method: "POST", body: JSON.stringify({ answer: "export function debounce(fn, wait) { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); }; d.cancel = () => clearTimeout(t); return d; }" }) }), { params: Promise.resolve({ id: started.attemptId }) })).json();
    expect(sub.attempt.status).toBe("graded");
    const after = await (await attemptGET(authed(`/api/practice/attempts/${started.attemptId}`), { params: Promise.resolve({ id: started.attemptId }) })).json();
    expect(after.task.hints.length).toBeGreaterThan(0);
    expect((await tasksGET(new NextRequest("http://localhost/api/practice/tasks"))).status).toBe(401);
  });
});
