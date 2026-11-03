import { connectToDatabase } from "@/app/lib/db";
import LlmUsage from "@/app/models/LlmUsage";
import AgentMessage from "@/app/models/AgentMessage";
import { alertAdmins } from "./alerts";

/**
 * Watches the spend ledger for the two things that cost real money by
 * surprise: a steady overrun (today's total) and a leak (an hour, a user or
 * the agent bus suddenly burning far more than usual). Thresholds are USD
 * per day / hour / user, from the env; the hard cap turns model calls off
 * for the rest of the day (lib/llm/chat.ts asks `spendAllowed()`).
 *
 *   COST_ALERT_DAILY_USD   (10)   today's total → "needs attention" + admin alert
 *   COST_ALERT_HOURLY_USD  (3)    last 60 minutes → leak alert
 *   COST_ALERT_USER_DAILY_USD (2) one person today → leak alert
 *   COST_HARD_CAP_DAILY_USD (25)  today's total → every model call refused until midnight UTC
 *   BUS_STORM_PER_HOUR     (400)  agent messages created in the last hour → runaway-chain alert
 */
export const LIMITS = {
  daily: () => Number(process.env.COST_ALERT_DAILY_USD || 10),
  hourly: () => Number(process.env.COST_ALERT_HOURLY_USD || 3),
  userDaily: () => Number(process.env.COST_ALERT_USER_DAILY_USD || 2),
  hardCap: () => Number(process.env.COST_HARD_CAP_DAILY_USD || 25),
  busStorm: () => Number(process.env.BUS_STORM_PER_HOUR || 400),
};

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const hourKey = (d: Date) => d.toISOString().slice(0, 13);
const r2 = (n: number) => Math.round(n * 100) / 100;

export type CostSummary = {
  today: number;
  yesterday: number;
  lastHour: number;
  last7d: number;
  last30d: number;
  estimatedShare: number; // 0–1 of today's cost that used a fallback price
  byModel: { model: string; usd: number; calls: number }[];
  byFeature: { feature: string; usd: number; calls: number }[];
  topUsers: { userId: string; usd: number; calls: number }[];
  byDay: { day: string; usd: number }[];
  busMessagesLastHour: number;
  limits: { daily: number; hourly: number; userDaily: number; hardCap: number; busStorm: number };
};

export async function costSummary(): Promise<CostSummary> {
  await connectToDatabase();
  const now = new Date();
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 864e5));
  const d7 = dayKey(new Date(now.getTime() - 7 * 864e5));
  const d30 = dayKey(new Date(now.getTime() - 30 * 864e5));
  const hours = [hourKey(now), hourKey(new Date(now.getTime() - 3600e3))]; // "last hour" = this hour + the previous one's tail
  const sum = async (match: Record<string, unknown>) => {
    const r: any[] = await LlmUsage.aggregate([{ $match: match }, { $group: { _id: null, usd: { $sum: "$usd" }, est: { $sum: { $cond: ["$estimated", "$usd", 0] } } } }]);
    return { usd: r[0]?.usd || 0, est: r[0]?.est || 0 };
  };
  const group = async (field: string, match: Record<string, unknown>, limit = 8) => {
    const r: any[] = await LlmUsage.aggregate([{ $match: match }, { $group: { _id: `$${field}`, usd: { $sum: "$usd" }, calls: { $sum: "$calls" } } }, { $sort: { usd: -1 } }, { $limit: limit }]);
    return r.map((x) => ({ key: x._id == null ? "" : String(x._id), usd: r2(x.usd), calls: x.calls }));
  };
  const [t, y, h, w, m, byModel, byFeature, topUsers, byDayRaw, busMessagesLastHour] = await Promise.all([
    sum({ day: today }),
    sum({ day: yesterday }),
    sum({ hour: { $in: hours } }),
    sum({ day: { $gte: d7 } }),
    sum({ day: { $gte: d30 } }),
    group("model", { day: { $gte: d7 } }),
    group("feature", { day: { $gte: d7 } }),
    group("userId", { day: today, userId: { $ne: null } }, 5),
    LlmUsage.aggregate([{ $match: { day: { $gte: d30 } } }, { $group: { _id: "$day", usd: { $sum: "$usd" } } }, { $sort: { _id: 1 } }]),
    AgentMessage.countDocuments({ createdAt: { $gt: new Date(now.getTime() - 3600e3) } }),
  ]);
  return {
    today: r2(t.usd),
    yesterday: r2(y.usd),
    lastHour: r2(h.usd),
    last7d: r2(w.usd),
    last30d: r2(m.usd),
    estimatedShare: t.usd ? r2(t.est / t.usd) : 0,
    byModel: byModel.map((x) => ({ model: x.key, usd: x.usd, calls: x.calls })),
    byFeature: byFeature.map((x) => ({ feature: x.key || "(untagged)", usd: x.usd, calls: x.calls })),
    topUsers: topUsers.map((x) => ({ userId: x.key, usd: x.usd, calls: x.calls })),
    byDay: (byDayRaw as any[]).map((x) => ({ day: x._id, usd: r2(x.usd) })),
    busMessagesLastHour,
    limits: { daily: LIMITS.daily(), hourly: LIMITS.hourly(), userDaily: LIMITS.userDaily(), hardCap: LIMITS.hardCap(), busStorm: LIMITS.busStorm() },
  };
}

export type CostBreach = { kind: "daily" | "hourly" | "user" | "bus_storm" | "hard_cap"; detail: string };

/** What is over the line right now. */
export function breachesOf(s: CostSummary): CostBreach[] {
  const out: CostBreach[] = [];
  if (s.today >= s.limits.hardCap) out.push({ kind: "hard_cap", detail: `today $${s.today} ≥ hard cap $${s.limits.hardCap}: model calls are refused until midnight UTC` });
  else if (s.today >= s.limits.daily) out.push({ kind: "daily", detail: `today $${s.today} ≥ $${s.limits.daily}` });
  if (s.lastHour >= s.limits.hourly) out.push({ kind: "hourly", detail: `last hour $${s.lastHour} ≥ $${s.limits.hourly}` });
  for (const u of s.topUsers) if (u.usd >= s.limits.userDaily) out.push({ kind: "user", detail: `user ${u.userId} spent $${u.usd} today (${u.calls} calls) ≥ $${s.limits.userDaily}` });
  if (s.busMessagesLastHour >= s.limits.busStorm) out.push({ kind: "bus_storm", detail: `${s.busMessagesLastHour} agent messages in the last hour ≥ ${s.limits.busStorm}: a chain may be looping` });
  return out;
}

/** Run the checks and notify admins (deduped per kind for an hour by alertAdmins). Returns what it found. */
export async function checkCostAlerts(): Promise<{ ok: boolean; summary: CostSummary; breaches: CostBreach[] }> {
  const summary = await costSummary();
  const breaches = breachesOf(summary);
  for (const b of breaches) {
    const title = b.kind === "hard_cap" ? "Spending hard cap reached — AI features paused" : b.kind === "bus_storm" ? "Agent bus storm" : b.kind === "user" ? "One user is spending unusually" : b.kind === "hourly" ? "Spending spike in the last hour" : "Daily spending over the alert line";
    await alertAdmins(`cost_${b.kind}`, title, `${b.detail}. Today $${summary.today}, last hour $${summary.lastHour}, 7 days $${summary.last7d}.`, "/AdminDashboard").catch(() => null);
  }
  return { ok: breaches.length === 0, summary, breaches };
}

/**
 * The circuit breaker: false once today's spend reached the hard cap. Cached
 * for a minute per instance so the check costs one small aggregate at most
 * once a minute, not one per model call.
 */
let capCache: { at: number; allowed: boolean; today: number } | null = null;
export async function spendAllowed(): Promise<{ allowed: boolean; today: number; cap: number }> {
  const cap = LIMITS.hardCap();
  if (!(cap > 0)) return { allowed: true, today: 0, cap };
  if (capCache && Date.now() - capCache.at < 60_000) return { allowed: capCache.allowed, today: capCache.today, cap };
  try {
    await connectToDatabase();
    const r: any[] = await LlmUsage.aggregate([{ $match: { day: dayKey(new Date()) } }, { $group: { _id: null, usd: { $sum: "$usd" } } }]);
    const today = r[0]?.usd || 0;
    capCache = { at: Date.now(), allowed: today < cap, today };
    return { allowed: today < cap, today: r2(today), cap };
  } catch {
    return { allowed: true, today: 0, cap }; // a monitoring failure must never take the product down
  }
}
export const resetSpendCache = () => {
  capCache = null;
};
