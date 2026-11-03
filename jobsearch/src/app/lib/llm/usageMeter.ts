import { AsyncLocalStorage } from "node:async_hooks";
import { connectToDatabase } from "@/app/lib/db";
import LlmUsage from "@/app/models/LlmUsage";
import { costOf, FLAT_USD } from "./pricing";

/**
 * The spend meter. Every model call (chat factory, embeddings, research,
 * voice sessions) lands here as tokens → USD, summed per hour / model / role /
 * feature / user. The feature and user come from the ambient scope that
 * consumeQuota() and the agent bus set, so call sites need no changes.
 *
 * Off under test unless COST_METER_IN_TESTS=1 (the suites' in-memory Mongo
 * would otherwise get writes after teardown).
 */
export type UsageScope = { userId?: string; feature?: string };
const scope = new AsyncLocalStorage<UsageScope>();

/** Tag everything the current async flow spends with a user and a feature (a quota key or a bus message type). */
export function enterUsageScope(s: UsageScope): void {
  scope.enterWith({ ...(scope.getStore() || {}), ...s });
}
export function withUsageScope<T>(s: UsageScope, fn: () => Promise<T>): Promise<T> {
  return scope.run({ ...(scope.getStore() || {}), ...s }, fn);
}
export const currentUsageScope = (): UsageScope => scope.getStore() || {};

export const meterEnabled = () => process.env.NODE_ENV !== "test" || process.env.COST_METER_IN_TESTS === "1";

export type UsageEvent = {
  provider: string;
  model: string;
  role?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** A flat charge instead of (or on top of) tokens: web search calls, voice minutes. */
  flatUsd?: number;
  feature?: string;
  userId?: string;
};

const hourKey = (d = new Date()) => d.toISOString().slice(0, 13);
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

/** Record one call. Never throws, never awaited by callers that would rather not wait (fire-and-forget is fine). */
export async function recordUsage(ev: UsageEvent): Promise<void> {
  if (!meterEnabled()) return;
  try {
    const s = currentUsageScope();
    const { usd, estimated } = costOf(ev.model, { input: ev.inputTokens, output: ev.outputTokens, cacheRead: ev.cacheReadTokens, cacheWrite: ev.cacheWriteTokens });
    const total = usd + (ev.flatUsd || 0);
    const userId = ev.userId ?? s.userId;
    const key = { hour: hourKey(), model: ev.model, role: ev.role || "", feature: ev.feature ?? s.feature ?? "", userId: userId && /^[0-9a-f]{24}$/i.test(userId) ? userId : undefined };
    await connectToDatabase();
    await LlmUsage.updateOne(
      key,
      {
        $setOnInsert: { ...key, day: dayKey(), provider: ev.provider },
        $inc: { calls: 1, inputTokens: ev.inputTokens || 0, outputTokens: ev.outputTokens || 0, cacheReadTokens: ev.cacheReadTokens || 0, cacheWriteTokens: ev.cacheWriteTokens || 0, usd: total },
        $set: { updatedAt: new Date(), ...(estimated ? { estimated: true } : {}) },
      },
      { upsert: true }
    );
  } catch (e) {
    console.warn("[cost] usage not recorded:", (e as Error)?.message);
  }
}

/**
 * Account deletion: keep the spend totals (the cost monitor's history) but drop
 * who caused them. Each of the person's rows is folded into the matching
 * untagged row (same hour/model/role/feature), then removed.
 */
export async function anonymizeUsageOf(userId: string): Promise<number> {
  await connectToDatabase();
  const rows: any[] = await LlmUsage.find({ userId }).lean();
  for (const r of rows) {
    const key = { hour: r.hour, model: r.model, role: r.role || "", feature: r.feature || "", userId: null };
    await LlmUsage.updateOne(
      key,
      {
        $setOnInsert: { ...key, day: r.day, provider: r.provider },
        $inc: { calls: r.calls || 0, inputTokens: r.inputTokens || 0, outputTokens: r.outputTokens || 0, cacheReadTokens: r.cacheReadTokens || 0, cacheWriteTokens: r.cacheWriteTokens || 0, usd: r.usd || 0 },
        $set: { updatedAt: r.updatedAt || new Date(), ...(r.estimated ? { estimated: true } : {}) },
      },
      { upsert: true }
    );
  }
  const { deletedCount } = await LlmUsage.deleteMany({ userId });
  return deletedCount || 0;
}

/** Flat charges that are not token-based. */
export const recordVoiceSession = (userId: string, model: string) => recordUsage({ provider: "openai", model, role: "voice", flatUsd: FLAT_USD.voiceSession, feature: "voice_session", userId });
export const recordPhoneSession = (userId: string, model: string) => recordUsage({ provider: "openai", model, role: "voice", flatUsd: FLAT_USD.phoneSession, feature: "phone_session", userId });
