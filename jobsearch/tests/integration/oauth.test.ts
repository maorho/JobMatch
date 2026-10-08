import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";
import User from "@/app/models/User";
import { GET as start } from "@/app/api/auth/oauth/[provider]/route";
import { GET as callback } from "@/app/api/auth/oauth/[provider]/callback/route";
import { verifyJwt } from "@/app/lib/jwt";
import { safeNext } from "@/app/lib/oauth/providers";

setupTestDb();

const ORIGIN = "http://localhost:3000";
const ctx = (provider: string) => ({ params: Promise.resolve({ provider }) });

/** Stub the provider: token exchange + profile endpoints. */
function stubProvider(profile: Record<string, unknown>, tokenOk = true) {
  vi.stubGlobal("fetch", vi.fn(async (input: any) => {
    const url = typeof input === "string" ? input : input.url ?? String(input);
    if (/oauth2\.googleapis\.com\/token|graph\.facebook\.com\/v19\.0\/oauth\/access_token/.test(url)) {
      return { ok: tokenOk, status: tokenOk ? 200 : 400, text: async () => JSON.stringify(tokenOk ? { access_token: "tok" } : { error: "invalid_grant" }) } as any;
    }
    if (/googleapis\.com\/oauth2\/v3\/userinfo|graph\.facebook\.com\/me/.test(url)) {
      return { ok: true, status: 200, text: async () => JSON.stringify(profile) } as any;
    }
    throw new Error("unexpected fetch " + url);
  }));
}

const cookieHeader = (res: Response, name: string) =>
  (res.headers.get("set-cookie") || "").split(/,(?=[^;]+=)/).find((c) => c.trim().startsWith(name + "="))?.split(";")[0].split("=").slice(1).join("=") || "";

beforeAll(async () => {
  await resetDb();
  process.env.GOOGLE_CLIENT_ID = "gid";
  process.env.GOOGLE_CLIENT_SECRET = "gsecret";
  process.env.FACEBOOK_APP_ID = "fid";
  process.env.FACEBOOK_APP_SECRET = "fsecret";
});
afterEach(() => vi.unstubAllGlobals());

async function login(provider: string, profile: Record<string, unknown>, next = "/") {
  const s = await start(new NextRequest(`${ORIGIN}/api/auth/oauth/${provider}?next=${encodeURIComponent(next)}`), ctx(provider));
  const state = cookieHeader(s, "oauth_state");
  const location = s.headers.get("location") || "";
  stubProvider(profile);
  const cb = await callback(
    new NextRequest(`${ORIGIN}/api/auth/oauth/${provider}/callback?code=abc&state=${encodeURIComponent(state)}`, { headers: { cookie: `oauth_state=${state}` } }),
    ctx(provider)
  );
  return { startStatus: s.status, location, state, cb };
}

describe("social login", () => {
  it("redirects to the provider with a CSRF state cookie", async () => {
    const s = await start(new NextRequest(`${ORIGIN}/api/auth/oauth/google?next=/Dashboard`), ctx("google"));
    expect(s.status).toBe(307);
    const loc = new URL(s.headers.get("location")!);
    expect(loc.hostname).toBe("accounts.google.com");
    expect(loc.searchParams.get("client_id")).toBe("gid");
    expect(loc.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/oauth/google/callback`);
    expect(loc.searchParams.get("state")).toBe(cookieHeader(s, "oauth_state"));
    expect(cookieHeader(s, "oauth_state")).not.toBe("");
  });

  it("creates the account on first Google login and issues the app session cookie", async () => {
    const { cb } = await login("google", { sub: "g-1", email: "Dana@Example.com", email_verified: true, name: "Dana Dev", picture: "https://img/x.png" });
    expect(cb.status).toBe(307);
    expect(cb.headers.get("location")).toBe(`${ORIGIN}/ResumeAI?welcome=1`); // new user → build a résumé
    const token = cookieHeader(cb, "token");
    expect(token).not.toBe("");
    const user: any = await User.findOne({ email: "dana@example.com" }).lean();
    expect(user).toMatchObject({ authProvider: "google", providerId: "g-1", fullname: "Dana Dev", avatar: "https://img/x.png", username: "dana" });
    const claims = await verifyJwt<{ id: string }>(token);
    expect(claims?.id).toBe(String(user._id));
  });

  it("reuses the account on the next login and honours ?next", async () => {
    const { cb } = await login("google", { sub: "g-1", email: "dana@example.com", email_verified: true, name: "Dana Dev" }, "/Dashboard");
    expect(cb.headers.get("location")).toBe(`${ORIGIN}/Dashboard`);
    expect(await User.countDocuments({ email: "dana@example.com" })).toBe(1);
  });

  it("links a password account by verified email, and keeps usernames unique", async () => {
    await User.create({ username: "danapw", email: "dana2@example.com", password: "x", fullname: "Old Dana", phone: "0" } as any);
    const { cb } = await login("facebook", { id: "fb-9", email: "dana2@example.com", name: "Dana FB", picture: { data: { url: "https://img/fb.png" } } });
    expect(cb.status).toBe(307);
    const linked: any = await User.findOne({ email: "dana2@example.com" }).lean();
    expect(linked.authProvider).toBe("facebook");
    expect(linked.providerId).toBe("fb-9");
    expect(linked.fullname).toBe("Old Dana"); // existing profile untouched
    expect(await User.countDocuments({ email: "dana2@example.com" })).toBe(1);
    // A brand-new user whose email prefix collides gets a suffixed username.
    const { cb: cb2 } = await login("google", { sub: "g-77", email: "dana@other.dev", email_verified: true, name: "Other Dana" });
    expect(cb2.status).toBe(307);
    expect(((await User.findOne({ email: "dana@other.dev" }).lean()) as any).username).toBe("dana2");
  });

  it("rejects a tampered state, a denied consent and an unverified email", async () => {
    const bad = await callback(new NextRequest(`${ORIGIN}/api/auth/oauth/google/callback?code=abc&state=forged`, { headers: { cookie: "oauth_state=real" } }), ctx("google"));
    expect(bad.headers.get("location")).toContain("error=oauth_state");
    const denied = await callback(new NextRequest(`${ORIGIN}/api/auth/oauth/google/callback?error=access_denied`), ctx("google"));
    expect(denied.headers.get("location")).toContain("error=oauth_denied");
    const { cb } = await login("google", { sub: "g-5", email: "unverified@example.com", email_verified: false, name: "U" });
    expect(cb.headers.get("location")).toContain("error=oauth_email_unverified");
    expect(await User.countDocuments({ email: "unverified@example.com" })).toBe(0);
  });

  it("fails cleanly when the provider is unknown or not configured", async () => {
    const unknown = await start(new NextRequest(`${ORIGIN}/api/auth/oauth/github`), ctx("github"));
    expect(unknown.status).toBe(404);
    const saved = process.env.FACEBOOK_APP_ID;
    delete process.env.FACEBOOK_APP_ID;
    const off = await start(new NextRequest(`${ORIGIN}/api/auth/oauth/facebook`), ctx("facebook"));
    expect(off.headers.get("location")).toContain("oauth_not_configured");
    process.env.FACEBOOK_APP_ID = saved;
  });

  it("only allows same-site relative destinations", () => {
    expect(safeNext("/Dashboard")).toBe("/Dashboard");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});
