import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcrypt";
import { setupTestDb, resetDb } from "../setup/mongo";
import User from "@/app/models/User";
import UsageCounter from "@/app/models/UsageCounter";
import LlmUsage from "@/app/models/LlmUsage";
import { signJwt } from "@/app/lib/jwt";
import { GET, PATCH, DELETE } from "@/app/api/admin/users/route";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { getUserIdFromToken } from "@/app/lib/getUserIdFromRequest";
import { consumeQuota, monthKey, FREE_MONTHLY_LIMITS, DEFAULT_LIMITS, _resetAgeCache } from "@/app/lib/ops/quota";

setupTestDb();

const O = "https://job-match.test";
let admin = "", dana = "", eli = "";
const tokens: Record<string, string> = {};
const req = (who: string, url: string, init: RequestInit = {}) => new NextRequest(`${O}${url}`, { ...init, headers: { cookie: `token=${tokens[who]}`, "Content-Type": "application/json", ...(init.headers || {}) } } as any);
const body = (who: string, method: "PATCH" | "DELETE", data: unknown) => req(who, "/api/admin/users", { method, body: JSON.stringify(data) });

beforeAll(async () => {
  await resetDb();
  process.env.QUOTA_ENFORCE_IN_TESTS = "1";
  const mk = async (u: Record<string, unknown>) => String((await User.create({ password: await bcrypt.hash("correct-horse-1", 4), phone: "0", ...u } as any))._id);
  admin = await mk({ username: "admin", email: "admin@test.dev", fullname: "Admin", admin: true });
  dana = await mk({ username: "dana", email: "dana@test.dev", fullname: "Dana Levi", resumeUpdatedAt: new Date(), level: "junior" });
  eli = await mk({ username: "eli", email: "eli@acme.com", fullname: "Eli Cohen", recruiter: true, approved: true, company: "Acme" });
  // Dana is an older account: the first-week daily caps would otherwise bind before the monthly allowance.
  await User.collection.updateOne({ _id: (await User.findById(dana).select("_id"))!._id }, { $set: { createdAt: new Date(Date.now() - 30 * 86_400_000) } });
  _resetAgeCache();
  for (const [k, id] of Object.entries({ admin, dana, eli })) tokens[k] = await signJwt({ id });
  await UsageCounter.create({ userId: dana, day: monthKey(), key: "tailor", n: 3 });
  await LlmUsage.create({ hour: `${monthKey()}-03T10`, day: `${monthKey()}-03`, provider: "openai", model: "gpt-x", role: "fast", feature: "tailor", userId: dana, calls: 4, usd: 0.1234 });
});
afterAll(() => {
  delete process.env.QUOTA_ENFORCE_IN_TESTS;
});

describe("admin users console", () => {
  it("is for admins only", async () => {
    expect((await GET(req("dana", "/api/admin/users"))).status).toBe(401);
    expect((await PATCH(body("dana", "PATCH", { userId: admin, admin: false }))).status).toBe(401);
    expect((await DELETE(body("eli", "DELETE", { userId: dana, confirm: "DELETE" }))).status).toBe(401);
  });

  it("lists accounts with their roles, plan, this month's allowances and AI spend; searches and filters", async () => {
    const all = await (await GET(req("admin", "/api/admin/users"))).json();
    expect(all.total).toBe(3);
    const d = all.users.find((u: any) => u.id === dana);
    expect(d).toMatchObject({ fullname: "Dana Levi", plan: "free", admin: false, hasResume: true, level: "junior", usageTotal: 3, spend: { usd: 0.12, calls: 4 } });
    expect(d.usage.find((x: any) => x.key === "tailor")).toEqual({ key: "tailor", used: 3, limit: FREE_MONTHLY_LIMITS.tailor });
    expect(all.users.find((u: any) => u.id === admin)).toMatchObject({ plan: "pro", admin: true }); // an admin is never capped
    expect(all.users.find((u: any) => u.id === eli)).toMatchObject({ recruiter: true, approved: true, company: "Acme" });

    const search = await (await GET(req("admin", "/api/admin/users?q=acme"))).json();
    expect(search.users.map((u: any) => u.id)).toEqual([eli]);
    const recruiters = await (await GET(req("admin", "/api/admin/users?filter=recruiters"))).json();
    expect(recruiters.users.map((u: any) => u.id)).toEqual([eli]);
    const free = await (await GET(req("admin", "/api/admin/users?filter=free"))).json();
    expect(free.users.map((u: any) => u.id).sort()).toEqual([dana, eli].sort());
    const withResume = await (await GET(req("admin", "/api/admin/users?filter=withResume"))).json();
    expect(withResume.users.map((u: any) => u.id)).toEqual([dana]);
  });

  it("changes the plan, and the quota follows at once; resets the month's usage", async () => {
    // Free: the monthly allowance binds.
    for (let i = 0; i < FREE_MONTHLY_LIMITS.prep_plan; i++) await consumeQuota(dana, "prep_plan");
    await expect(consumeQuota(dana, "prep_plan")).rejects.toMatchObject({ period: "month" });
    const r = await PATCH(body("admin", "PATCH", { userId: dana, plan: "pro" }));
    expect(r.status).toBe(200);
    expect((await consumeQuota(dana, "prep_plan")).limit).toBe(DEFAULT_LIMITS.prep_plan); // the cached plan was forgotten
    expect((await (await GET(req("admin", "/api/admin/users?q=dana"))).json()).users[0].plan).toBe("pro");
    // Back to free with the month wiped: a fresh allowance.
    await PATCH(body("admin", "PATCH", { userId: dana, plan: "free", resetMonthlyUsage: true }));
    expect(await UsageCounter.countDocuments({ userId: dana, day: monthKey() })).toBe(0);
    expect((await (await GET(req("admin", "/api/admin/users?q=dana"))).json()).users[0]).toMatchObject({ plan: "free", usageTotal: 0 });
    _resetAgeCache();
  });

  it("disables an account: sessions stop and the password no longer opens the door; enabling restores it", async () => {
    expect(await getUserIdFromToken(tokens.dana)).toBe(dana);
    await PATCH(body("admin", "PATCH", { userId: dana, disabled: true }));
    expect(await getUserIdFromToken(tokens.dana)).toBeNull();
    const login = await loginPOST(new NextRequest(`${O}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "dana@test.dev", password: "correct-horse-1" }) } as any));
    expect(login.status).toBe(403);
    expect((await login.json()).disabled).toBe(true);
    const list = await (await GET(req("admin", "/api/admin/users?filter=disabled"))).json();
    expect(list.users.map((u: any) => u.id)).toEqual([dana]);
    await PATCH(body("admin", "PATCH", { userId: dana, disabled: false }));
    expect(await getUserIdFromToken(tokens.dana)).toBe(dana);
  });

  it("grants and removes the admin role, but never on the admin's own account", async () => {
    expect((await PATCH(body("admin", "PATCH", { userId: eli, admin: true }))).status).toBe(200);
    expect((await (await GET(req("admin", "/api/admin/users?filter=admins"))).json()).users.map((u: any) => u.id).sort()).toEqual([admin, eli].sort());
    expect((await PATCH(body("admin", "PATCH", { userId: eli, admin: false }))).status).toBe(200);
    expect((await PATCH(body("admin", "PATCH", { userId: admin, admin: false }))).status).toBe(400);
    expect((await PATCH(body("admin", "PATCH", { userId: admin, disabled: true }))).status).toBe(400);
    expect((await PATCH(body("admin", "PATCH", { userId: admin, plan: "gold" }))).status).toBe(400);
    expect((await PATCH(body("admin", "PATCH", { userId: admin }))).status).toBe(400);
  });

  it("deletes an account (with its rows) on an explicit confirmation, never its own", async () => {
    expect((await DELETE(body("admin", "DELETE", { userId: eli }))).status).toBe(400);
    expect((await DELETE(body("admin", "DELETE", { userId: admin, confirm: "DELETE" }))).status).toBe(400);
    expect((await DELETE(body("admin", "DELETE", { userId: eli, confirm: "DELETE" }))).status).toBe(200);
    expect(await User.findById(eli)).toBeNull();
    expect(await getUserIdFromToken(tokens.eli)).toBeNull();
    expect((await DELETE(body("admin", "DELETE", { userId: eli, confirm: "DELETE" }))).status).toBe(404);
    expect((await (await GET(req("admin", "/api/admin/users"))).json()).total).toBe(2);
  });
});
