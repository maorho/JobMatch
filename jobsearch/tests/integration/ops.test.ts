import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

import User from "@/app/models/User";
import Notification from "@/app/models/Notification";
import UsageCounter from "@/app/models/UsageCounter";
import { signJwt } from "@/app/lib/jwt";
import { setMailTransport } from "@/app/lib/email/send";
import { consumeQuota, QuotaError, quotaResponse, limitFor, usageToday } from "@/app/lib/ops/quota";
import { alertAdmins, resetAlertDedup } from "@/app/lib/ops/alerts";
import { GET as healthGET } from "@/app/api/admin/health/route";
import { POST as submitPOST } from "@/app/api/practice/attempts/[id]/submit/route";

setupTestDb();

const outbox: { to: string; subject: string }[] = [];
let admin = "", dana = "", adminToken = "", danaToken = "";
beforeAll(async () => {
  await resetDb();
  admin = String((await User.create({ username: "root", email: "root@test.dev", password: "x", fullname: "Root", phone: "0", admin: true } as any))._id);
  dana = String((await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana", phone: "0" } as any))._id);
  adminToken = await signJwt({ id: admin });
  danaToken = await signJwt({ id: dana });
  setMailTransport(async (m) => {
    outbox.push(m);
    return { id: "1" };
  });
  process.env.QUOTA_ENFORCE_IN_TESTS = "1";
  process.env.CRON_SECRET = process.env.CRON_SECRET || "test-cron-secret";
});
afterAll(() => {
  setMailTransport(null);
  delete process.env.QUOTA_ENFORCE_IN_TESTS;
  delete process.env.QUOTA_PRACTICE_GRADE;
  delete process.env.ALERT_EMAIL;
});
const authed = (token: string, url: string, init: RequestInit = {}) => new NextRequest(`http://localhost${url}`, { ...init, headers: { cookie: `token=${token}`, "Content-Type": "application/json", ...(init.headers || {}) } } as any);

describe("daily quotas", () => {
  it("counts per user per day, refuses past the limit (without counting the refusal), and env overrides the default", async () => {
    process.env.QUOTA_PRACTICE_GRADE = "2";
    expect(limitFor("practice_grade")).toBe(2);
    expect(limitFor("voice_session")).toBe(5);
    expect(await consumeQuota(dana, "practice_grade")).toEqual({ used: 1, limit: 2, remaining: 1 });
    expect(await consumeQuota(dana, "practice_grade")).toEqual({ used: 2, limit: 2, remaining: 0 });
    await expect(consumeQuota(dana, "practice_grade")).rejects.toBeInstanceOf(QuotaError);
    const row: any = await UsageCounter.findOne({ userId: dana, key: "practice_grade" }).lean();
    expect(row.n).toBe(2);
    expect(await consumeQuota(admin, "practice_grade")).toMatchObject({ used: 1 }); // separate per user
    expect(await usageToday()).toMatchObject({ practice_grade: 3 });
    let res: any = null;
    try {
      await consumeQuota(dana, "practice_grade");
    } catch (e) {
      res = quotaResponse(e);
    }
    expect(res.status).toBe(429);
    expect((await res.json()).message).toMatch(/מכסה היומית/);
    expect(quotaResponse(new Error("other"))).toBeNull();
  });

  it("a guarded route answers 429 once the cap is spent", async () => {
    process.env.QUOTA_PRACTICE_GRADE = "2";
    const r = await submitPOST(authed(danaToken, "/api/practice/attempts/000000000000000000000000/submit", { method: "POST", body: JSON.stringify({ answer: "x" }) }), { params: Promise.resolve({ id: "000000000000000000000000" }) });
    expect(r.status).toBe(429);
    expect((await r.json()).error).toBe("quota");
  });
});

describe("admin alerts and health", () => {
  it("alerts every admin in-app (and by email when ALERT_EMAIL is set), deduplicated per key for an hour", async () => {
    process.env.ALERT_EMAIL = "ops@test.dev";
    resetAlertDedup();
    const r = await alertAdmins("agents_failed", "3 agent messages failed", "flow=drain", "/AdminDashboard/agents");
    expect(r).toEqual({ notified: 1, emailed: true, deduped: false });
    const n: any = await Notification.findOne({ userId: admin }).lean();
    expect(n.title).toBe("⚠️ 3 agent messages failed");
    expect(n.link).toBe("/AdminDashboard/agents");
    expect(outbox.at(-1)!.subject).toBe("[JobMatch alert] 3 agent messages failed");
    expect(await alertAdmins("agents_failed", "again", "x")).toMatchObject({ deduped: true });
    expect(await Notification.countDocuments({ userId: admin })).toBe(1);
    expect(await Notification.countDocuments({ userId: dana })).toBe(0);
  });

  it("the health endpoint reports db / catalogue / agents / config and is admin- or cron-secret-only", async () => {
    expect((await healthGET(new NextRequest("http://localhost/api/admin/health"))).status).toBe(403);
    expect((await healthGET(authed(danaToken, "/api/admin/health"))).status).toBe(403);
    const res = await healthGET(authed(adminToken, "/api/admin/health"));
    const h = await res.json();
    expect(h.checks.db.ok).toBe(true);
    expect(h.checks.catalog).toMatchObject({ ok: false, jobs: 0 }); // an empty catalogue is not healthy
    expect(h.checks.agents).toMatchObject({ queued: 0, failed24h: 0 });
    expect(h.checks.config).toMatchObject({ cronSecret: true, email: "custom", features: { phone: false } });
    expect(h.checks.product).toMatchObject({ users: 2 });
    expect(h.checks.usageToday.practice_grade).toMatchObject({ used: 3, limitPerUser: 2 });
    expect(h.ok).toBe(false);
    expect(res.status).toBe(207);
    const viaSecret = await healthGET(new NextRequest(`http://localhost/api/admin/health?cron_secret=${process.env.CRON_SECRET}`));
    expect(viaSecret.status).toBe(207);
  });
});
