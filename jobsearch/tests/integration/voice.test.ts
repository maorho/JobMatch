import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

process.env.OPENAI_API_KEY = "sk-test";

// The debrief LLM (feedback) — the only chat model this file hits.
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class {
    async invoke(msgs: any[]) {
      const sys = String(msgs[0]?.content || "");
      const user = String(msgs[1]?.content || "");
      return { content: JSON.stringify({ overallScore: 68, verdict: "lean hire", summary: "ok", dimensions: [], strengths: ["x"], improvements: ["y"], answerReviews: [], nextSteps: [], delivery: { score: sys.includes("VOICE and TONE") && (sys + user).includes("monotone") ? 5 : 8, notes: "דבר/י עם יותר וריאציה בטון; סיים/י משפטים בירידה." } }) };
    }
  },
}));
// OpenAI Realtime: GA endpoint answers with a client secret.
const realtimeCalls: any[] = [];
vi.stubGlobal("fetch", vi.fn(async (input: any, init: any) => {
  const url = typeof input === "string" ? input : input.url ?? String(input);
  realtimeCalls.push({ url, body: JSON.parse(init?.body || "{}") });
  if (url.endsWith("/v1/realtime/client_secrets")) return { ok: true, status: 200, json: async () => ({ value: "ek_test_123", expires_at: 1900000000 }), text: async () => "" } as any;
  throw new Error("unexpected fetch " + url);
}));

import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import InterviewPrep from "@/app/models/InterviewPrep";
import InterviewSession from "@/app/models/InterviewSession";
import { signJwt } from "@/app/lib/jwt";
import { buildVoiceInstructions, computeDelivery, describeDelivery, countFillers, summarizeTone, END_TOOL, END_TOOL_DEF, createRealtimeClientSecret } from "@/app/lib/interview/voice";
import { buildFeedbackPrompt } from "@/app/lib/interview/simulator";
import { POST as voicePOST, PATCH as voicePATCH, GET as voiceGET } from "@/app/api/interview/voice/route";
import { POST as finishPOST } from "@/app/api/interview/session/finish/route";
import { GET as sessGET } from "@/app/api/interview/session/route";

setupTestDb();

const O = "http://localhost";
const cookie = async (id: string) => ({ cookie: `token=${await signJwt({ id })}`, "Content-Type": "application/json" });
const j = async (res: Response) => ({ status: res.status, body: await res.json() });
const PLAN = { company: { summary: "Acme builds cloud security.", whatTheyDo: "CNAPP", techStack: ["Go"], cultureHints: [] }, roleSummary: "Junior.", stages: [{ key: "hr", title: "שיחת HR", description: "", likelyQuestions: [{ question: "ספר/י על עצמך", whyAsked: "", howToAnswer: "" }], tips: [] }, { key: "technical", title: "טכני", description: "", likelyQuestions: [], tips: [] }], gaps: [], questionsToAsk: [], checklist: [] };
const monotone = { pitchMedianHz: 120, pitchVarSemitones: 0.9, loudnessDb: -40, loudnessVarDb: 2, pauseRatio: 0.35, endTrendDb: -9, voicedFrames: 80 };
const lively = { pitchMedianHz: 190, pitchVarSemitones: 3.4, loudnessDb: -22, loudnessVarDb: 5, pauseRatio: 0.12, endTrendDb: 1, voicedFrames: 120 };
let me = "", prepId = "";

beforeAll(async () => {
  await resetDb();
  me = String((await User.create({ username: "me", email: "me@test.dev", password: "x", fullname: "Me", phone: "0", resumeText: "Junior React developer" } as any))._id);
  const job = await ExternalJobs.create({ job: "Junior Frontend Developer", company: "Acme", city: "Tel Aviv", country: "Israel", url: "u", finalUrl: "u", description: "React", skills: [], seniority: [], source: "greenhouse", sourceJobId: "a1" } as any);
  prepId = String((await InterviewPrep.create({ userId: me, jobId: job._id, source: "external", jobTitle: "Junior Frontend Developer", company: "Acme", plan: PLAN, model: "test" }))._id);
});

describe("voice instructions + tool", () => {
  it("turns the interviewer prompt into call etiquette and makes the model report what it heard", () => {
    const sys = buildVoiceInstructions({ plan: PLAN as any, stage: "hr", job: { title: "Dev", company: "Acme" }, companyBrief: "About: Acme", language: "he", targetQuestions: 5, transcript: [] });
    expect(sys).toMatch(/LIVE VOICE CALL/);
    expect(sys).toMatch(/Listen to HOW they speak/);
    expect(sys).toContain(`call the ${END_TOOL} tool`);
    expect(sys).not.toContain("<<END>>");
    expect(END_TOOL_DEF.parameters.required).toContain("vocal_impression");
    expect(Object.keys(END_TOOL_DEF.parameters.properties.vocal_impression.properties)).toEqual(expect.arrayContaining(["confidence", "energy", "clarity", "pace", "warmth", "notes"]));
  });

  it("mints a client secret on the GA endpoint with transcription + the end tool", async () => {
    const s = await createRealtimeClientSecret({ instructions: "hi", language: "he" });
    expect(s).toMatchObject({ value: "ek_test_123", endpoint: "calls", model: "gpt-realtime-mini" });
    const call = realtimeCalls.find((c) => c.url.endsWith("/client_secrets"));
    expect(call.body.session.tools[0].name).toBe(END_TOOL);
    expect(call.body.session.audio.input.transcription.language).toBe("he");
    expect(call.body.session.instructions).toBe("hi");
  });
});

describe("delivery + tone metrics", () => {
  it("counts fillers in Hebrew and English", () => {
    expect(countFillers("אממ, אז כאילו עבדתי על זה, you know, basically")).toBe(4);
    expect(countFillers("I like React")).toBe(1);
    expect(countFillers("עבדתי שנתיים ב-React")).toBe(0);
  });

  it("summarizes tone from the measured answers and the interviewer's impression", () => {
    const turns = [
      { role: "interviewer" as const, content: "q1" },
      { role: "candidate" as const, content: "אממ אני מפתח ריאקט כבר שנתיים ובניתי שלושה פרויקטים", seconds: 20, prosody: monotone },
      { role: "interviewer" as const, content: "q2" },
      { role: "candidate" as const, content: "כן", seconds: 2, prosody: { ...monotone, voicedFrames: 3 } }, // too short to measure
    ];
    const m = computeDelivery(turns, { confidence: 2, energy: 2, clarity: 4, warmth: 3, pace: "too slow", notes: "hesitant, trailing off" });
    expect(m).toMatchObject({ answers: 2, totalSpeakingSeconds: 22, fillerWords: 1, shortAnswers: 1 });
    expect(m.tone).toMatchObject({ measuredAnswers: 1, expressiveness: "monotone", volume: "quiet", trailingOffAnswers: 1 });
    const note = describeDelivery(m, "he");
    expect(note).toMatch(/monotone/);
    expect(note).toMatch(/quiet/);
    expect(note).toMatch(/trailed off/);
    expect(note).toMatch(/confidence 2/);
    expect(summarizeTone([{ role: "candidate", content: "x", prosody: lively }]).expressiveness).toBe("natural");
    const { system } = buildFeedbackPrompt({ plan: PLAN as any, stage: "hr", job: { title: "Dev", company: "Acme" }, companyBrief: "", language: "he", transcript: [], deliveryNote: note });
    expect(system).toMatch(/VOICE and TONE/);
    expect(system).toMatch(/"delivery": \{"score": number, "notes": string\}/);
  });
});

describe("voice session routes", () => {
  it("starts a voice session, stores the transcript with prosody and impression, and the debrief scores the voice", async () => {
    expect((await j(await voiceGET())).body).toMatchObject({ configured: true, model: "gpt-realtime-mini" });
    const started = await j(await voicePOST(new NextRequest(`${O}/api/interview/voice`, { method: "POST", headers: await cookie(me), body: JSON.stringify({ prepId, stage: "hr", questions: 4 }) })));
    expect(started.status).toBe(200);
    expect(started.body).toMatchObject({ clientSecret: "ek_test_123", endpoint: "calls", targetQuestions: 4, stage: "hr" });
    const sessionId = started.body.sessionId;
    const doc: any = await InterviewSession.findById(sessionId).lean();
    expect(doc.mode).toBe("voice");
    expect(doc.companyBrief).toContain("Acme builds cloud security.");
    const instr = realtimeCalls.filter((c) => c.url.endsWith("/client_secrets")).pop().body.session.instructions;
    expect(instr).toMatch(/HR recruiter at Acme/);
    expect(instr).toMatch(/Junior React developer/); // the candidate's résumé is in the interviewer's head

    const turns = [
      { role: "interviewer", content: "היי, אני מגייסת ב-Acme. ספר/י על עצמך." },
      { role: "candidate", content: "אממ אני מפתח ריאקט, בניתי שלושה פרויקטים", seconds: 18, prosody: monotone },
      { role: "interviewer", content: "למה אצלנו?" },
      { role: "candidate", content: "כי אתם עובדים על אבטחת ענן וזה מעניין אותי מאוד", seconds: 12, prosody: monotone },
      { role: "interviewer", content: "תודה, נחזור אליך." },
    ];
    const saved = await j(await voicePATCH(new NextRequest(`${O}/api/interview/voice`, { method: "PATCH", headers: await cookie(me), body: JSON.stringify({ sessionId, turns, wrappedUp: true, impression: { confidence: 2, energy: 2, clarity: 4, warmth: 3, pace: "too slow", notes: "hesitant start, trailing off", junk: 1 } }) })));
    expect(saved.status).toBe(200);
    expect(saved.body.delivery.tone.expressiveness).toBe("monotone");
    expect(saved.body.delivery.impression).toMatchObject({ confidence: 2, pace: "too slow" });
    expect(saved.body.delivery.impression.junk).toBeUndefined();

    const fb = await j(await finishPOST(new NextRequest(`${O}/api/interview/session/finish`, { method: "POST", headers: await cookie(me), body: JSON.stringify({ sessionId }) })));
    expect(fb.status).toBe(200);
    expect(fb.body.feedback.delivery).toEqual({ score: 5, notes: expect.stringMatching(/וריאציה/) }); // the LLM saw "monotone" in the note
    expect(fb.body.delivery.tone.measuredAnswers).toBe(2);

    const one = await j(await sessGET(new NextRequest(`${O}/api/interview/session?sessionId=${sessionId}`, { headers: await cookie(me) })));
    expect(one.body.session).toMatchObject({ mode: "voice", status: "finished" });
    expect(one.body.session.delivery.impression.notes).toMatch(/hesitant/);
    // A finished session is frozen.
    expect((await j(await voicePATCH(new NextRequest(`${O}/api/interview/voice`, { method: "PATCH", headers: await cookie(me), body: JSON.stringify({ sessionId, turns: [] }) })))).body.frozen).toBe(true);
  });

  it("refuses without a key or a session", async () => {
    expect((await voicePOST(new NextRequest(`${O}/api/interview/voice`, { method: "POST", body: JSON.stringify({ prepId }) }))).status).toBe(401);
    const key = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    expect((await voicePOST(new NextRequest(`${O}/api/interview/voice`, { method: "POST", headers: await cookie(me), body: JSON.stringify({ prepId, stage: "hr" }) }))).status).toBe(503);
    process.env.OPENAI_API_KEY = key;
  });
});
