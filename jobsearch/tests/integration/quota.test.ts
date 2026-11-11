import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestDb, resetDb } from "../setup/mongo";
import User from "@/app/models/User";
import { consumeQuota, limitFor, isNewAccount, NEW_USER_LIMITS, DEFAULT_LIMITS, FREE_MONTHLY_LIMITS, QuotaError, _resetAgeCache, usageForUser, monthKey } from "@/app/lib/ops/quota";

setupTestDb();

let fresh = "", veteran = "";
beforeAll(async () => {
  await resetDb();
  process.env.QUOTA_ENFORCE_IN_TESTS = "1";
  fresh = String((await User.create({ username: "fresh", email: "fresh@test.dev", password: "x", fullname: "Fresh", phone: "050" } as any))._id);
  const v = await User.create({ username: "vet", email: "vet@test.dev", password: "x", fullname: "Vet", phone: "050" } as any);
  await User.collection.updateOne({ _id: v._id }, { $set: { createdAt: new Date(Date.now() - 30 * 86_400_000) } });
  veteran = String(v._id);
  _resetAgeCache();
});
afterAll(() => {
  delete process.env.QUOTA_ENFORCE_IN_TESTS;
});

describe("new-account quotas", () => {
  it("an account younger than NEW_USER_DAYS gets the small allowance, an older one the normal limit", async () => {
    expect(await isNewAccount(fresh)).toBe(true);
    expect(await isNewAccount(veteran)).toBe(false);
    expect(limitFor("voice_session", { newAccount: true })).toBe(NEW_USER_LIMITS.voice_session);
    expect(limitFor("voice_session")).toBe(DEFAULT_LIMITS.voice_session);
    const f = await consumeQuota(fresh, "voice_session");
    expect(f.limit).toBe(NEW_USER_LIMITS.voice_session);
    const v = await consumeQuota(veteran, "voice_session");
    expect(v.limit).toBe(DEFAULT_LIMITS.voice_session);
  });

  it("the small allowance really stops at its limit", async () => {
    const limit = NEW_USER_LIMITS.resume_build; // 2
    for (let i = 0; i < limit; i++) await consumeQuota(fresh, "resume_build");
    await expect(consumeQuota(fresh, "resume_build")).rejects.toBeInstanceOf(QuotaError);
    // the veteran is unaffected
    expect((await consumeQuota(veteran, "resume_build")).limit).toBe(DEFAULT_LIMITS.resume_build);
  });

  it("a key without a new-account entry keeps its normal limit", () => {
    expect(limitFor("some_future_key", { newAccount: true })).toBe(50);
  });
});

describe("free-plan monthly allowance", () => {
  it("a free account stops at the month's allowance even when the day still allows; a pro account does not", async () => {
    const monthly = FREE_MONTHLY_LIMITS.prep_plan; // 8, under the daily 10
    expect(monthly).toBeLessThan(DEFAULT_LIMITS.prep_plan);
    for (let i = 0; i < monthly; i++) await consumeQuota(veteran, "prep_plan");
    let err: unknown = null;
    await consumeQuota(veteran, "prep_plan").catch((e) => (err = e));
    expect(err).toBeInstanceOf(QuotaError);
    expect((err as QuotaError).period).toBe("month");
    expect((err as QuotaError).limit).toBe(monthly);
    // The refused call is not counted, on either counter.
    const usage = await usageForUser(veteran);
    expect(usage.plan).toBe("free");
    expect(usage.month).toBe(monthKey());
    expect(usage.features.find((f) => f.key === "prep_plan")).toEqual({ key: "prep_plan", used: monthly, limit: monthly });
    // Upgrade the account: only the daily cap applies and the Settings card shows no limit.
    await User.updateOne({ _id: veteran }, { $set: { plan: "pro" } });
    _resetAgeCache();
    expect((await consumeQuota(veteran, "prep_plan")).limit).toBe(DEFAULT_LIMITS.prep_plan);
    expect((await usageForUser(veteran)).plan).toBe("pro");
    expect((await usageForUser(veteran)).features.find((f) => f.key === "prep_plan")?.limit).toBeNull();
  });

  it("a key without a monthly entry is capped per day only", async () => {
    for (let i = 0; i < 5; i++) await consumeQuota(veteran, "interview_turn");
    expect((await usageForUser(veteran)).features.find((f) => f.key === "interview_turn")).toBeUndefined();
  });
});
