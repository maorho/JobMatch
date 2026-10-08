import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

process.env.TOKEN_ENCRYPTION_KEY = "test-token-encryption-key-123456";
process.env.GOOGLE_CLIENT_ID = "gid";
process.env.GOOGLE_CLIENT_SECRET = "gsecret";

import User from "@/app/models/User";
import Job from "@/app/models/Job";
import Company from "@/app/models/Company";
import Candidates from "@/app/models/Candidates";
import ExternalJobs from "@/app/models/ExternalJobs";
import ApplicationEvent from "@/app/models/ApplicationEvent";
import Notification from "@/app/models/Notification";
import { signJwt } from "@/app/lib/jwt";
import { seal, open } from "@/app/lib/crypto/secretBox";
import { applicationMailQuery, extractBody, type GmailMessage } from "@/app/lib/email/gmail";
import { matchApplication, syncUserEmails } from "@/app/lib/email/track";
import { GET as gmailGET, POST as gmailPOST, DELETE as gmailDELETE } from "@/app/api/integrations/gmail/route";
import { GET as cronGET } from "@/app/api/integrations/gmail/sync/route";
import { GET as connectGET } from "@/app/api/integrations/gmail/connect/route";

setupTestDb();

const O = "http://localhost";
let me = "";
const cookie = async (id: string) => ({ cookie: `token=${await signJwt({ id })}`, "Content-Type": "application/json" });
const j = async (res: Response) => ({ status: res.status, body: await res.json() });

const MAILS: GmailMessage[] = [
  { id: "m1", from: "Talent <talent@acme.com>", subject: "Next steps: Junior Frontend Developer", date: new Date("2026-10-07T10:00:00Z"), snippet: "", body: "Hi Dana, we'd love to schedule a technical interview for the Junior Frontend Developer position at Acme." },
  { id: "m2", from: "no-reply@globex.com", subject: "Your application", date: new Date("2026-10-06T10:00:00Z"), snippet: "", body: "Unfortunately we decided to move forward with other candidates for the Backend role." },
  { id: "m3", from: "deals@shop.com", subject: "50% off", date: new Date("2026-10-05T10:00:00Z"), snippet: "", body: "Big sale this week only!" },
];
const CLASSIFIED = [
  { id: "m1", isJobRelated: true, company: "Acme", roleTitle: "Junior Frontend Developer", status: "Technical Interview", confidence: 0.92, summary: "זימון לראיון טכני" },
  { id: "m2", isJobRelated: true, company: "Globex", roleTitle: "Backend", status: "Rejected", confidence: 0.95, summary: "דחייה" },
  { id: "m3", isJobRelated: false, company: "", roleTitle: "", status: null, confidence: 0.99, summary: "" },
];
const deps = { list: vi.fn(async () => MAILS), classify: vi.fn(async () => CLASSIFIED as any) };

beforeAll(async () => {
  await resetDb();
  // Token refresh is the only real network call left in syncUserEmails; stub it.
  vi.stubGlobal("fetch", vi.fn(async (input: any) => {
    const url = typeof input === "string" ? input : input.url ?? String(input);
    if (url.includes("oauth2.googleapis.com/token")) return { ok: true, status: 200, json: async () => ({ access_token: "at" }) } as any;
    throw new Error("unexpected fetch " + url);
  }));
  const u = await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana", phone: "0", gmail: { address: "dana@gmail.com", refreshTokenSealed: seal("refresh-123"), connectedAt: new Date() } } as any);
  me = String(u._id);
  const co = await Company.create({ companyName: "Acme" } as any).catch(() => Company.findOne({ companyName: "Acme" }));
  const internal = await Job.create({ job: "Junior Frontend Developer", company: (co as any)._id, type: "On Site", city: "TLV", country: "Israel" } as any);
  const external = await ExternalJobs.create({ job: "Backend Engineer", company: "Globex Technologies", city: "TLV", country: "Israel", url: "u", finalUrl: "u", description: "", skills: [], seniority: [], source: "greenhouse", sourceJobId: "g1" } as any);
  await Candidates.create([
    { candidateId: me, jobId: internal._id, jobModel: "Job", status: "HR Phone Interview" },
    { candidateId: me, jobId: external._id, jobModel: "ExternalJobs", status: "Submitted Resume" },
  ] as any);
});

describe("building blocks", () => {
  it("seals and opens secrets, and never stores them in clear", async () => {
    const s = seal("hello");
    expect(s).not.toContain("hello");
    expect(open(s)).toBe("hello");
    expect(() => open("v1.bad")).toThrow();
    const u: any = await User.findById(me).select("+gmail.refreshTokenSealed").lean();
    expect(u.gmail.refreshTokenSealed).not.toContain("refresh-123");
    expect(((await User.findById(me).lean()) as any).gmail.refreshTokenSealed).toBeUndefined(); // select:false by default
  });

  it("builds a bilingual Gmail query and extracts plain text from MIME", () => {
    const q = applicationMailQuery(14);
    expect(q).toContain("newer_than:14d");
    expect(q).toContain("interview");
    expect(q).toContain("ראיון");
    const payload = { mimeType: "multipart/alternative", parts: [{ mimeType: "text/html", body: { data: Buffer.from("<p>Hi <b>there</b></p>").toString("base64url") } }, { mimeType: "text/plain", body: { data: Buffer.from("Hi there").toString("base64url") } }] };
    expect(extractBody(payload)).toBe("Hi there");
    expect(extractBody({ mimeType: "text/html", body: { data: Buffer.from("<div>Only <i>html</i></div>").toString("base64url") } })).toBe("Only html");
  });

  it("matches emails to applications by company, then role", () => {
    const apps = [
      { _id: "a", status: "Submitted Resume", company: "Acme", title: "Junior Frontend Developer", jobModel: "Job", jobId: "j" },
      { _id: "b", status: "Submitted Resume", company: "Acme", title: "Data Scientist", jobModel: "Job", jobId: "j" },
      { _id: "c", status: "Submitted Resume", company: "Globex Technologies", title: "Backend Engineer", jobModel: "ExternalJobs", jobId: "j" },
    ];
    expect(matchApplication({ id: "x", isJobRelated: true, company: "Acme", roleTitle: "Frontend", status: null, confidence: 1, summary: "" }, apps)?._id).toBe("a");
    expect(matchApplication({ id: "x", isJobRelated: true, company: "Globex", roleTitle: "", status: null, confidence: 1, summary: "" }, apps)?._id).toBe("c"); // "Technologies" stripped
    expect(matchApplication({ id: "x", isJobRelated: true, company: "Initech", roleTitle: "", status: null, confidence: 1, summary: "" }, apps)).toBeNull();
  });
});

describe("syncUserEmails", () => {
  it("updates statuses that advance, records a timeline, notifies, and is idempotent", async () => {
    const r = await syncUserEmails(me, deps);
    expect(r).toMatchObject({ fetched: 3, classified: 3, events: 2, updated: 2 });
    const apps: any[] = await Candidates.find({ candidateId: me }).lean();
    expect(apps.find((a) => a.jobModel === "Job").status).toBe("Technical Interview"); // HR → Technical
    expect(apps.find((a) => a.jobModel === "ExternalJobs").status).toBe("Rejected");
    expect(await ApplicationEvent.countDocuments({ userId: me })).toBe(3); // incl. the ignored promo
    expect(await ApplicationEvent.countDocuments({ userId: me, applied: true })).toBe(2);
    const n: any = await Notification.find({ userId: me, type: "application_status" }).lean();
    expect(n).toHaveLength(2);
    expect(n.map((x: any) => x.title).join(" ")).toContain("Junior Frontend Developer");
    expect(((await User.findById(me).lean()) as any).gmail.lastSyncAt).toBeInstanceOf(Date);

    // Same mails again → nothing new, no second classification call.
    const calls = deps.classify.mock.calls.length;
    const again = await syncUserEmails(me, deps);
    expect(again).toMatchObject({ fetched: 3, classified: 0, events: 0, updated: 0 });
    expect(deps.classify.mock.calls.length).toBe(calls);
    expect(await Notification.countDocuments({ userId: me, type: "application_status" })).toBe(2);
  });

  it("never moves an application backwards and ignores low-confidence guesses", async () => {
    const weak = { list: vi.fn(async () => [{ id: "m9", from: "x", subject: "s", date: new Date(), snippet: "", body: "b" }, { id: "m10", from: "x", subject: "s", date: new Date(), snippet: "", body: "b" }]), classify: vi.fn(async () => [
      { id: "m9", isJobRelated: true, company: "Acme", roleTitle: "Junior Frontend Developer", status: "Submitted Resume", confidence: 0.95, summary: "" }, // backwards
      { id: "m10", isJobRelated: true, company: "Acme", roleTitle: "Junior Frontend Developer", status: "Final Interview", confidence: 0.3, summary: "" }, // too weak
    ] as any) };
    const r = await syncUserEmails(me, weak);
    expect(r.updated).toBe(0);
    expect(((await Candidates.findOne({ candidateId: me, jobModel: "Job" })) as any).status).toBe("Technical Interview");
  });

  it("reports NOT_CONNECTED for users without Gmail", async () => {
    const u = await User.create({ username: "nog", email: "nog@test.dev", password: "x", fullname: "No G", phone: "0" } as any);
    expect((await syncUserEmails(String(u._id), deps)).error).toBe("NOT_CONNECTED");
  });
});

describe("routes", () => {
  it("exposes status + events, syncs on demand, disconnects, and guards the cron", async () => {
    const st = await j(await gmailGET(new NextRequest(`${O}/api/integrations/gmail`, { headers: await cookie(me) })));
    expect(st.body.connected).toBe(true);
    expect(st.body.address).toBe("dana@gmail.com");
    expect(st.body.events.every((e: any) => e.applied || e.status)).toBe(true); // the promo email is excluded
    expect(st.body.events.filter((e: any) => e.applied)).toHaveLength(2);
    expect((await cronGET(new NextRequest(`${O}/api/integrations/gmail/sync?cron_secret=nope`))).status).toBe(401);
    const c = await connectGET(new NextRequest(`${O}/api/integrations/gmail/connect`, { headers: await cookie(me) }));
    expect(c.status).toBe(307);
    expect(c.headers.get("location")).toMatch(/gmail\.readonly/);
    expect(c.headers.get("location")).toMatch(/access_type=offline/);
    const d = await gmailDELETE(new NextRequest(`${O}/api/integrations/gmail`, { method: "DELETE", headers: await cookie(me) }));
    expect(d.status).toBe(200);
    expect(((await gmailGET(new NextRequest(`${O}/api/integrations/gmail`, { headers: await cookie(me) }))).status)).toBe(200);
    expect((await j(await gmailPOST(new NextRequest(`${O}/api/integrations/gmail`, { method: "POST", headers: await cookie(me) })))).status).toBe(400); // disconnected now
  });
});
