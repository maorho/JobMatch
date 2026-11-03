import { describe, it, expect, beforeAll, vi } from "vitest";
import { setupTestDb, resetDb } from "../setup/mongo";

process.env.COST_METER_IN_TESTS = "1";
process.env.COST_ALERT_DAILY_USD = "1";
process.env.COST_ALERT_HOURLY_USD = "0.5";
process.env.COST_ALERT_USER_DAILY_USD = "0.3";
process.env.COST_HARD_CAP_DAILY_USD = "2";

vi.mock("@/app/lib/email/send", () => ({ sendEmail: async () => ({ sent: false }) }));

import mongoose from "mongoose";
import LlmUsage from "@/app/models/LlmUsage";
import Notification from "@/app/models/Notification";
import User from "@/app/models/User";
import { costOf, priceFor } from "@/app/lib/llm/pricing";
import { recordUsage, withUsageScope } from "@/app/lib/llm/usageMeter";
import { costSummary, breachesOf, checkCostAlerts, spendAllowed, resetSpendCache } from "@/app/lib/ops/costMonitor";

setupTestDb();

beforeAll(async () => {
  await resetDb();
});

describe("pricing", () => {
  it("prices known models, matches dated ids by prefix, and falls back (flagged) for unknown ones", () => {
    expect(costOf("claude-opus-5-5", { input: 1_000_000, output: 0 }).usd).toBe(4);
    expect(costOf("gpt-6.1-sol", { input: 0, output: 1_000_000 }).usd).toBe(10);
    expect(priceFor("gpt-4o-2024-08-06").price.in).toBe(2.5);
    const cached = costOf("claude-sonnet-5-5", { input: 1_000_000, cacheRead: 900_000 }); // 100k at $2 + 900k at $0.1
    expect(cached.usd).toBeCloseTo(0.2 + 0.09, 6);
    const unknown = costOf("future-model-9", { input: 1_000_000 });
    expect(unknown.estimated).toBe(true);
    expect(unknown.usd).toBe(2);
    expect(costOf("text-embedding-3-small", { input: 1_000_000 }).usd).toBe(0.02);
  });
});

describe("usage meter + cost monitor", () => {
  it("sums calls per hour/model/feature/user with the scope set by the request, and the summary adds up", async () => {
    const dana = await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana", phone: "0", admin: true } as any);
    const uid = String(dana._id);
    await withUsageScope({ userId: uid, feature: "interview_turn" }, async () => {
      await recordUsage({ provider: "openai", model: "gpt-6.1-sol", role: "interviewer", inputTokens: 100_000, outputTokens: 10_000 }); // $0.30
      await recordUsage({ provider: "openai", model: "gpt-6.1-sol", role: "interviewer", inputTokens: 100_000, outputTokens: 10_000 }); // $0.30
    });
    await recordUsage({ provider: "openai", model: "text-embedding-3-small", role: "embedding", inputTokens: 1_000_000 }); // $0.02, untagged
    await recordUsage({ provider: "openai", model: "gpt-4o", role: "research", inputTokens: 0, outputTokens: 0, flatUsd: 0.05, feature: "research" });
    const rows: any[] = await LlmUsage.find().lean();
    const turn = rows.find((r) => r.feature === "interview_turn");
    expect(turn.calls).toBe(2);
    expect(turn.usd).toBeCloseTo(0.6, 6);
    expect(String(turn.userId)).toBe(uid);
    const s = await costSummary();
    expect(s.today).toBeCloseTo(0.67, 2);
    expect(s.lastHour).toBeCloseTo(0.67, 2);
    expect(s.byFeature.find((f) => f.feature === "interview_turn")?.usd).toBeCloseTo(0.6, 2);
    expect(s.topUsers[0]).toMatchObject({ userId: uid, calls: 2 });

    // $0.67 today: over the hourly line (0.5) and the per-user line (0.3), under the daily line (1) and the cap (2).
    const breaches = breachesOf(s);
    expect(breaches.map((b) => b.kind).sort()).toEqual(["hourly", "user"]);
    const checked = await checkCostAlerts();
    expect(checked.ok).toBe(false);
    const alerts: any[] = await Notification.find({ userId: dana._id, type: "system" }).lean();
    expect(alerts.map((a) => a.meta?.alert).sort()).toEqual(["cost_hourly", "cost_user"]); // admins are told, once per kind per hour
    expect(await spendAllowed()).toMatchObject({ allowed: true, cap: 2 });
  });

  it("the hard cap pauses model calls for the day, and the chat factory refuses before calling a provider", async () => {
    await recordUsage({ provider: "anthropic", model: "claude-opus-5-5", role: "coach", inputTokens: 0, outputTokens: 100_000, feature: "interview_session" }); // +$2
    resetSpendCache();
    const gate = await spendAllowed();
    expect(gate.allowed).toBe(false);
    expect(gate.today).toBeGreaterThanOrEqual(2);
    expect(breachesOf(await costSummary()).some((b) => b.kind === "hard_cap")).toBe(true);
    const { chatModel, SpendCapError } = await import("@/app/lib/llm/chat");
    await expect(chatModel("fast", { json: true }).invoke([])).rejects.toBeInstanceOf(SpendCapError);
    expect(mongoose.connection.readyState).toBe(1);
  });
});
