import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";
import User from "@/app/models/User";
import Job from "@/app/models/Job";
import Company from "@/app/models/Company";
import Candidates from "@/app/models/Candidates";
import Notification from "@/app/models/Notification";
import { signJwt } from "@/app/lib/jwt";
import { GET as listGET, POST as openPOST } from "@/app/api/messages/route";
import { GET as threadGET, POST as sendPOST } from "@/app/api/messages/[conversationId]/route";

setupTestDb();

const O = "http://localhost";
let cand = "", rec = "", stranger = "", applicant2 = "", jobId = "", otherJobId = "";
const cookie = async (id: string) => ({ cookie: `token=${await signJwt({ id })}`, "Content-Type": "application/json" });
const j = async (res: Response) => ({ status: res.status, body: await res.json() });
const ctx = (conversationId: string) => ({ params: Promise.resolve({ conversationId }) });
const open = async (me: string, userId: string, job: string) => j(await openPOST(new NextRequest(`${O}/api/messages`, { method: "POST", headers: await cookie(me), body: JSON.stringify({ userId, jobId: job }) })));
const send = async (me: string, c: string, body: string) => j(await sendPOST(new NextRequest(`${O}/api/messages/${c}`, { method: "POST", headers: await cookie(me), body: JSON.stringify({ body }) }), ctx(c)));
const read = async (me: string, c: string) => j(await threadGET(new NextRequest(`${O}/api/messages/${c}`, { headers: await cookie(me) }), ctx(c)));
const list = async (me: string) => j(await listGET(new NextRequest(`${O}/api/messages`, { headers: await cookie(me) })));

beforeAll(async () => {
  await resetDb();
  const mk = (u: string, extra = {}) => User.create({ username: u, email: `${u}@test.dev`, password: "x", fullname: u.toUpperCase(), phone: "0", ...extra } as any);
  cand = String((await mk("cand"))._id);
  rec = String((await mk("rec", { recruiter: true, company: "Acme" }))._id);
  stranger = String((await mk("stranger"))._id);
  applicant2 = String((await mk("applicant2"))._id);
  const co = await Company.create({ companyName: "Acme" } as any).catch(() => Company.findOne({ companyName: "Acme" }));
  jobId = String((await Job.create({ job: "Junior Dev", company: (co as any)._id, type: "On Site", city: "TLV", country: "Israel", publisher: rec } as any))._id);
  otherJobId = String((await Job.create({ job: "No Publisher Job", company: (co as any)._id, type: "On Site", city: "TLV", country: "Israel" } as any))._id);
  await Candidates.create({ candidateId: applicant2, jobId, jobModel: "Job" } as any);
});

describe("who can message whom", () => {
  it("anyone may contact the job's recruiter; a recruiter may contact applicants only", async () => {
    expect((await open(cand, rec, jobId)).status).toBe(200);
    expect((await open(rec, applicant2, jobId)).status).toBe(200);
    expect((await open(rec, stranger, jobId)).status).toBe(403); // never applied
    expect((await open(cand, stranger, jobId)).status).toBe(403); // not the recruiter
    expect((await open(cand, rec, otherJobId)).status).toBe(403); // job without a publisher
    expect((await open(cand, cand, jobId)).status).toBe(400);
    expect((await open(cand, rec, "nope")).status).toBe(400);
    expect((await openPOST(new NextRequest(`${O}/api/messages`, { method: "POST", body: "{}" }))).status).toBe(401);
  });

  it("returns the same thread for the same pair + job from either side", async () => {
    const a = await open(applicant2, rec, jobId);
    const b = await open(rec, applicant2, jobId);
    expect(a.status).toBe(200);
    expect(a.body.conversationId).toBe(b.body.conversationId);
    // A recruiter can't open a thread with someone who never applied, but can
    // reply in any thread they are part of.
    expect((await open(cand, rec, jobId)).status).toBe(200);
    expect((await open(rec, cand, jobId)).status).toBe(403);
    expect((await send(rec, a.body.conversationId, "thanks for applying")).status).toBe(200);
  });
});

describe("sending, reading, unread counters, notifications", () => {
  it("delivers messages, counts unread for the recipient, and notifies them", async () => {
    const c = (await open(cand, rec, jobId)).body.conversationId;
    expect((await send(cand, c, "שלום, אשמח לשמוע עוד על המשרה")).status).toBe(200);
    expect((await send(cand, c, "")).status).toBe(400);
    expect((await send(stranger, c, "hi")).status).toBe(403); // not a participant

    const recList = await list(rec);
    expect(recList.body.unreadTotal).toBe(1);
    const t = recList.body.items.find((x: any) => x._id === c);
    expect(t.other.fullname).toBe("CAND");
    expect(t.job.title).toBe("Junior Dev");
    expect(t.lastMessage).toContain("שלום");
    expect(t.lastSenderId).toBe(cand);

    const n: any = await Notification.findOne({ userId: rec, type: "new_message" }).lean();
    expect(n.title).toContain("CAND");
    expect(n.link).toBe(`/messages?c=${c}`);

    // Opening the thread marks it read for the recruiter.
    const thread = await read(rec, c);
    expect(thread.status).toBe(200);
    expect(thread.body.messages).toHaveLength(1);
    expect(thread.body.messages[0].senderId).toBe(cand);
    expect((await list(rec)).body.unreadTotal).toBe(0);
    const senderView = await read(cand, c);
    expect(senderView.body.messages[0].readAt).not.toBeNull();
    expect((await read(stranger, c)).status).toBe(403);
    expect((await read(cand, "64b000000000000000000000")).status).toBe(404);
  });

  it("orders threads by latest activity and caps message length", async () => {
    const c1 = (await open(cand, rec, jobId)).body.conversationId;
    const c2 = (await open(rec, applicant2, jobId)).body.conversationId;
    await send(rec, c2, "first");
    await new Promise((r) => setTimeout(r, 5));
    await send(rec, c1, "second");
    const mine = await list(rec);
    expect(mine.body.items.map((x: any) => x._id).slice(0, 2)).toEqual([c1, c2]);
    expect((await send(rec, c1, "x".repeat(4001))).status).toBe(413);
  });
});
