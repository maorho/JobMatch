import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

process.env.CRON_SECRET = "svc-secret";
process.env.OPENAI_API_KEY = "sk-test";
vi.mock("@langchain/openai", () => ({ ChatOpenAI: class { async invoke() { return { content: "{}" }; } } }));

// Twilio REST is stubbed; everything else goes through.
const twilio: any[] = [];
vi.stubGlobal("fetch", vi.fn(async (input: any, init: any) => {
  const url = typeof input === "string" ? input : input.url ?? String(input);
  if (url.includes("api.twilio.com")) {
    twilio.push({ url, body: Object.fromEntries(new URLSearchParams(String(init?.body || ""))) });
    return { ok: true, status: 201, json: async () => ({ sid: "CA123", status: "queued" }) } as any;
  }
  throw new Error("unexpected fetch " + url);
}));

import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import InterviewPrep from "@/app/models/InterviewPrep";
import InterviewSession from "@/app/models/InterviewSession";
import { signJwt } from "@/app/lib/jwt";
import { toE164, callTwiml, phoneConfigured } from "@/app/lib/interview/phone";
import { POST as phonePOST, GET as phoneGET, DELETE as phoneDELETE } from "@/app/api/interview/phone/route";
import { GET as statusGET } from "@/app/api/interview/phone/status/route";
import { PATCH as voicePATCH } from "@/app/api/interview/voice/route";

setupTestDb();

const O = "http://localhost";
const cookie = async (id: string) => ({ cookie: `token=${await signJwt({ id })}`, "Content-Type": "application/json" });
const j = async (res: Response) => ({ status: res.status, body: await res.json() });
const PLAN = { company: { summary: "Acme builds cloud security.", whatTheyDo: "CNAPP", techStack: ["Go"], cultureHints: [] }, roleSummary: "Junior.", stages: [{ key: "hr", title: "שיחת HR", description: "", likelyQuestions: [{ question: "ספר/י על עצמך", whyAsked: "", howToAnswer: "" }], tips: [] }, { key: "technical", title: "טכני", description: "", likelyQuestions: [], tips: [] }], gaps: [], questionsToAsk: [], checklist: [] };
let me = "", prepId = "";

beforeAll(async () => {
  await resetDb();
  me = String((await User.create({ username: "me", email: "me@test.dev", password: "x", fullname: "Me", phone: "054-123-4567", resumeText: "Junior React developer" } as any))._id);
  const job = await ExternalJobs.create({ job: "Junior Frontend Developer", company: "Acme", city: "Tel Aviv", country: "Israel", url: "u", finalUrl: "u", description: "React", skills: [], seniority: [], source: "greenhouse", sourceJobId: "a1" } as any);
  prepId = String((await InterviewPrep.create({ userId: me, jobId: job._id, source: "external", jobTitle: "Junior Frontend Developer", company: "Acme", plan: PLAN, model: "test" }))._id);
});

describe("phone helpers", () => {
  it("normalises Israeli numbers and builds the TwiML that streams the call to the bridge", () => {
    expect(toE164("054-123-4567")).toBe("+972541234567");
    expect(toE164("+1 415 555 0100")).toBe("+14155550100");
    expect(toE164("0097235551234")).toBe("+97235551234");
    expect(toE164("12")).toBeNull();
    const xml = callTwiml({ streamUrl: "wss://bridge.example/phone/stream/abc", sessionId: "abc", greeting: "Hi & welcome" });
    expect(xml).toContain('<Stream url="wss://bridge.example/phone/stream/abc">');
    expect(xml).toContain("Hi &amp; welcome");
    expect(xml).toContain('<Parameter name="sessionId" value="abc" />');
  });
});

describe("phone interview route", () => {
  it("is off until Twilio is configured", async () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    expect(phoneConfigured()).toBe(false);
    expect((await j(await statusGET())).body.configured).toBe(false);
    expect((await phonePOST(new NextRequest(`${O}/api/interview/phone`, { method: "POST", headers: await cookie(me), body: JSON.stringify({ prepId, stage: "hr" }) }))).status).toBe(503);
  });

  it("places the call, stores the interviewer instructions for the bridge, and lets the bridge read/write with the service token", async () => {
    Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM: "+972500000000", PHONE_BRIDGE_WSS_URL: "wss://bridge.example" });
    process.env.FEATURE_PHONE = "1"; // launch flag: the phone channel stays off until it is tested on real calls
    expect((await j(await statusGET())).body.configured).toBe(true);
    const r = await j(await phonePOST(new NextRequest(`${O}/api/interview/phone`, { method: "POST", headers: await cookie(me), body: JSON.stringify({ prepId, stage: "hr", questions: 5 }) })));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ callSid: "CA123", to: "+972541234567" }); // profile phone, normalised
    expect(twilio[0].body.To).toBe("+972541234567");
    expect(twilio[0].body.Twiml).toContain(`wss://bridge.example/phone/stream/${r.body.sessionId}`);
    const doc: any = await InterviewSession.findById(r.body.sessionId).select("+instructions").lean();
    expect(doc).toMatchObject({ mode: "voice", channel: "phone", callSid: "CA123" });
    expect(doc.instructions).toMatch(/THIS IS A PHONE CALL/);
    expect(doc.instructions).toContain(r.body.interviewer.name);

    // Bridge-side reads need the service token, not a cookie.
    expect((await phoneGET(new NextRequest(`${O}/api/interview/phone?id=${r.body.sessionId}`))).status).toBe(403);
    const cfg = await j(await phoneGET(new NextRequest(`${O}/api/interview/phone?id=${r.body.sessionId}`, { headers: { "x-service-token": "svc-secret" } })));
    expect(cfg.body.instructions).toMatch(/HR recruiter at Acme/);
    expect(cfg.body.tools[0].name).toBe("end_interview");
    expect(cfg.body.silenceMs).toBeGreaterThan(1000);

    const patched = await j(await voicePATCH(new NextRequest(`${O}/api/interview/voice`, { method: "PATCH", headers: { "x-service-token": "svc-secret", "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: r.body.sessionId, turns: [{ role: "interviewer", content: "היי" }, { role: "candidate", content: "שלום, אני דנה", seconds: 3 }], wrappedUp: true, impression: { confidence: 4, energy: 3, clarity: 4, warmth: 4, pace: "good", notes: "clear" } }) })));
    expect(patched.status).toBe(200);
    expect(patched.body.wrappedUp).toBe(true);
    expect((await voicePATCH(new NextRequest(`${O}/api/interview/voice`, { method: "PATCH", headers: { "x-service-token": "wrong", "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: r.body.sessionId, turns: [] }) }))).status).toBe(401);

    const hung = await j(await phoneDELETE(new NextRequest(`${O}/api/interview/phone`, { method: "DELETE", headers: await cookie(me), body: JSON.stringify({ sessionId: r.body.sessionId }) })));
    expect(hung.status).toBe(200);
    expect(twilio.at(-1).url).toContain("/Calls/CA123.json");
    expect(twilio.at(-1).body.Status).toBe("completed");
    // A custom number works too, and a bad one is refused.
    expect((await j(await phonePOST(new NextRequest(`${O}/api/interview/phone`, { method: "POST", headers: await cookie(me), body: JSON.stringify({ prepId, stage: "hr", phone: "12" }) })))).status).toBe(400);
  });
});
