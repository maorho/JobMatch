import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcrypt";
import { setupTestDb, resetDb } from "../setup/mongo";

import User from "@/app/models/User";
import { setMailTransport, sendEmail, mailTransportName } from "@/app/lib/email/send";
import { requestPasswordReset, resetPassword, hashToken, resetEmail, RESET_TTL_MIN } from "@/app/lib/auth/passwordReset";
import { POST as forgotPOST } from "@/app/api/auth/password/forgot/route";
import { POST as resetPOST } from "@/app/api/auth/password/reset/route";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { GET as meGET } from "@/app/api/auth/me/route";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { verifyJwt } from "@/app/lib/jwt";

setupTestDb();

const outbox: { to: string; subject: string; text: string; html: string; from: string }[] = [];
const linkOf = (text: string) => /https?:\/\/\S+\/PasswordReset\?token=(\S+)/.exec(text)!;

beforeAll(async () => {
  await resetDb();
  await User.create({ username: "dana", email: "Dana@Test.dev", password: await bcrypt.hash("old-password-1", 10), fullname: "Dana Levi", phone: "0" } as any);
  setMailTransport(async (m) => {
    outbox.push(m);
    return { id: `fake-${outbox.length}` };
  });
});
afterAll(() => setMailTransport(null));

const json = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } as any);

describe("password reset by email", () => {
  it("mails a single-use link (only its hash is stored), case-insensitively, and never reveals whether the account exists", async () => {
    const r = await requestPasswordReset("dana@test.DEV");
    expect(r).toMatchObject({ ok: true, sent: true, transport: "custom" });
    expect(r.devLink).toBeUndefined();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe("dana@test.dev"); // the schema lowercases emails
    expect(outbox[0].subject).toMatch(/Reset your JobMatch password/);
    const [, token] = linkOf(outbox[0].text);
    const u: any = await User.findOne({ email: "dana@test.dev" }).select("+resetTokenHash resetTokenExpires").lean();
    expect(u.resetTokenHash).toBe(hashToken(decodeURIComponent(token)));
    expect(u.resetTokenHash).not.toContain(token);
    expect(new Date(u.resetTokenExpires).getTime() - Date.now()).toBeGreaterThan((RESET_TTL_MIN - 1) * 60_000);
    const e = resetEmail("Dana Levi", "https://x/PasswordReset?token=abc");
    expect(e.html).toContain("Hi Dana");
    expect(e.text).toContain("https://x/PasswordReset?token=abc");

    const nobody = await requestPasswordReset("nobody@test.dev");
    expect(nobody).toMatchObject({ ok: true, sent: false });
    expect(outbox).toHaveLength(1);
  });

  it("resets the password with a fresh token once; the old token and the old password stop working", async () => {
    const [, token] = linkOf(outbox[0].text);
    // A session from before the reset (e.g. the attacker's) …
    const before = await loginPOST(json("/api/auth/login", { email: "dana@test.dev", password: "old-password-1" }));
    const oldSession = /token=([^;]+)/.exec(before.headers.get("set-cookie") || "")![1];
    const withCookie = (t: string) => new NextRequest("http://localhost/api/auth/me", { headers: { cookie: `token=${t}` } } as any);
    expect(await getUserIdFromRequest(withCookie(oldSession))).toBeTruthy();
    expect(await resetPassword(decodeURIComponent(token), "short")).toEqual({ ok: false, error: "weak_password" });
    expect(await resetPassword("not-a-real-token-at-all", "new-password-123")).toEqual({ ok: false, error: "invalid_token" });
    const r = await resetPassword(decodeURIComponent(token), "new-password-123");
    expect(r).toEqual({ ok: true, email: "dana@test.dev" });
    const u: any = await User.findOne({ email: "dana@test.dev" }).select("+resetTokenHash password").lean();
    expect(u.resetTokenHash).toBeUndefined();
    expect(await bcrypt.compare("new-password-123", u.password)).toBe(true);
    expect(await resetPassword(decodeURIComponent(token), "another-password-1")).toEqual({ ok: false, error: "invalid_token" }); // single use

    const login = await loginPOST(json("/api/auth/login", { email: "dana@test.dev", password: "new-password-123" }));
    expect(login.status).toBe(200);
    const old = await loginPOST(json("/api/auth/login", { email: "dana@test.dev", password: "old-password-1" }));
    expect(old.status).not.toBe(200);

    // … is revoked by the reset (tokenVersion bumped); the new login's session works.
    expect(await getUserIdFromRequest(withCookie(oldSession))).toBeNull();
    expect((await meGET(withCookie(oldSession))).status).toBe(401);
    const fresh = /token=([^;]+)/.exec(login.headers.get("set-cookie") || "")![1];
    expect(await verifyJwt(fresh)).toMatchObject({ tv: 1 });
    expect((await meGET(withCookie(fresh))).status).toBe(200);
  });

  it("an expired token is refused (410) and cleared", async () => {
    await requestPasswordReset("dana@test.dev");
    const [, token] = linkOf(outbox[outbox.length - 1].text);
    await User.updateOne({ email: "dana@test.dev" }, { $set: { resetTokenExpires: new Date(Date.now() - 1000) } });
    const res = await resetPOST(json("/api/auth/password/reset", { token: decodeURIComponent(token), password: "whatever-123" }));
    expect(res.status).toBe(410);
    expect((await res.json()).error).toBe("expired");
    const u: any = await User.findOne({ email: "dana@test.dev" }).select("+resetTokenHash").lean();
    expect(u.resetTokenHash).toBeUndefined();
  });

  it("the routes: forgot always answers 200; reset validates; without any transport the console fallback is reported", async () => {
    const forgot = await forgotPOST(json("/api/auth/password/forgot", { email: "dana@test.dev" }));
    expect(forgot.status).toBe(200);
    expect((await forgot.json()).sent).toBe(true);
    const bad = await resetPOST(json("/api/auth/password/reset", { token: "x", password: "whatever-123" }));
    expect(bad.status).toBe(410);
    const weak = await resetPOST(json("/api/auth/password/reset", { token: "x".repeat(40), password: "123" }));
    expect(weak.status).toBe(400);

    setMailTransport(null);
    expect(mailTransportName()).toBe("console");
    const r = await sendEmail({ to: "a@b.c", subject: "s", html: "<b>h</b>", text: "t" });
    expect(r).toMatchObject({ sent: false, transport: "console" });
    const req = await requestPasswordReset("dana@test.dev");
    expect(req.sent).toBe(false);
    expect(req.devLink).toMatch(/\/PasswordReset\?token=/); // NODE_ENV=test ≠ production → the link is surfaced for local testing
  });
});
