import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcrypt";
import { setupTestDb, resetDb } from "../setup/mongo";

vi.mock("@/app/lib/matcher/embeddings", async () => import("../setup/fakeEmbedder"));
vi.mock("@/app/lib/pdf/extractText", () => ({ extractPdfText: async () => ({ text: "" }) }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class { async send() { return {}; } },
  PutObjectCommand: class { constructor(public input: any) {} },
  DeleteObjectCommand: class { constructor(public input: any) {} },
}));

import User from "@/app/models/User";
import RateLimit from "@/app/models/RateLimit";
import { signJwt, verifyJwt } from "@/app/lib/jwt";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { peekRateLimit, rateLimit } from "@/app/lib/ops/rateLimit";
import { GET as meGET } from "@/app/api/auth/me/route";
import { POST as passwordPOST } from "@/app/api/settings/password/route";
import { POST as signupPOST } from "@/app/api/auth/signup/route";

setupTestDb();

const O = "http://localhost";
const withToken = (token: string, url = "/api/auth/me", init: RequestInit = {}) =>
  new NextRequest(`${O}${url}`, { ...init, headers: { cookie: `token=${token}`, "Content-Type": "application/json" } } as any);
const tokenFrom = (res: Response) => /token=([^;]+)/.exec(res.headers.get("set-cookie") || "")?.[1] || "";

let uid = "";
beforeAll(async () => {
  await resetDb();
  await RateLimit.syncIndexes();
  uid = String((await User.create({ username: "noa", email: "noa@test.dev", fullname: "Noa", phone: "0", password: await bcrypt.hash("old-password-1", 4) } as any))._id);
});

describe("session revocation (tokenVersion)", () => {
  it("a token without `tv` is accepted while tokenVersion is 0; a stale `tv` or unknown user is not", async () => {
    const legacy = await signJwt({ id: uid, email: "noa@test.dev", admin: false });
    expect(await getUserIdFromRequest(withToken(legacy))).toBe(uid);
    expect((await meGET(withToken(legacy))).status).toBe(200);
    expect(await getUserIdFromRequest(withToken(await signJwt({ id: uid, tv: 3 })))).toBeNull();
    expect(await getUserIdFromRequest(withToken(await signJwt({ id: String(new (await import("mongoose")).default.Types.ObjectId()) })))).toBeNull();
    expect(await getUserIdFromRequest(withToken(await signJwt({ id: "not-an-id" })))).toBeNull();
  });

  it("changing the password revokes other sessions and re-issues this one", async () => {
    const other = await signJwt({ id: uid, email: "noa@test.dev", admin: false, tv: 0 });
    const mine = await signJwt({ id: uid, email: "noa@test.dev", admin: false, tv: 0 });
    const wrong = await passwordPOST(withToken(mine, "/api/settings/password", { method: "POST", body: JSON.stringify({ currentPassword: "nope", newPassword: "new-password-1" }) }));
    expect(wrong.status).toBe(403);
    expect(((await User.findById(uid).lean()) as any).tokenVersion).toBe(0); // a failed attempt revokes nothing

    const res = await passwordPOST(withToken(mine, "/api/settings/password", { method: "POST", body: JSON.stringify({ currentPassword: "old-password-1", newPassword: "new-password-1" }) }));
    expect(res.status).toBe(200);
    expect(((await User.findById(uid).lean()) as any).tokenVersion).toBe(1);
    expect(await getUserIdFromRequest(withToken(other))).toBeNull();
    expect(await getUserIdFromRequest(withToken(mine))).toBeNull();
    const reissued = tokenFrom(res);
    expect(await verifyJwt(reissued)).toMatchObject({ id: uid, tv: 1 });
    expect(await getUserIdFromRequest(withToken(reissued))).toBe(uid);
    const u: any = await User.findById(uid).select("+password");
    expect(await bcrypt.compare("new-password-1", u.password)).toBe(true);
  });
});

describe("/api/auth/me error mapping", () => {
  it("401 for a bad/missing token, 500 (not 401) when the database fails", async () => {
    expect((await meGET(new NextRequest(`${O}/api/auth/me`))).status).toBe(401);
    expect((await meGET(withToken("garbage"))).status).toBe(401);
    const good = await signJwt({ id: uid, tv: 1 });
    const spy = vi.spyOn(User, "findById").mockImplementation((() => { throw new Error("db down"); }) as any);
    try {
      expect((await meGET(withToken(good))).status).toBe(500);
    } finally {
      spy.mockRestore();
    }
    expect((await meGET(withToken(good))).status).toBe(200);
  });
});

describe("rate limits that count only what matters", () => {
  it("peekRateLimit reads without counting", async () => {
    expect(await peekRateLimit("t:peek", 2, 60_000)).toMatchObject({ ok: true, count: 0 });
    expect(await peekRateLimit("t:peek", 2, 60_000)).toMatchObject({ ok: true, count: 0 });
    await rateLimit("t:peek", 2, 60_000);
    await rateLimit("t:peek", 2, 60_000);
    const r = await peekRateLimit("t:peek", 2, 60_000);
    expect(r).toMatchObject({ ok: false, count: 2 });
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });

  it("signup: failed attempts are free; 10 accounts per hour per IP", async () => {
    const ip = "192.0.2.44";
    const signup = (i: number, withResume = true) => {
      const fd = new FormData();
      fd.set("email", `u${i}@test.dev`);
      fd.set("password", "pass-word-123");
      fd.set("fullname", `U ${i}`);
      fd.set("username", `u${i}`);
      fd.set("phone", "050");
      if (withResume) fd.set("resume", new File([Buffer.from("%PDF-1.4 fake")], "cv.pdf", { type: "application/pdf" }));
      return signupPOST(new NextRequest(`${O}/api/auth/signup`, { method: "POST", body: fd, headers: { "x-forwarded-for": ip } } as any));
    };
    for (let i = 0; i < 12; i++) expect((await signup(100 + i, false)).status).toBe(400); // missing résumé: not counted
    for (let i = 0; i < 10; i++) {
      const res = await signup(i);
      expect(res.status).toBe(200);
      expect(await verifyJwt(tokenFrom(res))).toMatchObject({ email: `u${i}@test.dev`, tv: 0 });
    }
    expect((await signup(10)).status).toBe(429);
    expect(await User.countDocuments({ email: "u10@test.dev" })).toBe(0);
  });
});
