import { describe, it, expect, beforeEach, vi } from "vitest";
import { setupTestDb, resetDb } from "../setup/mongo";

/**
 * Bus lease ownership and the Scout's retry-safe fan-out. The Scout's
 * runScout is scripted per test (`scoutImpl`), which gives us a handler that
 * heartbeats (opts.heartbeat is ctx.heartbeat) and sends follow-ups.
 */
let scoutImpl: (opts: any) => Promise<any> = async () => done(null);
const done = (nextOffset: number | null) => ({ sources: 1, totalSources: 2, processed: 1, nextOffset, created: 0, removed: 0, results: [] });
vi.mock("@/app/lib/scout/runScout", () => ({ runScout: vi.fn((opts: any) => scoutImpl(opts)) }));

import AgentMessage from "@/app/models/AgentMessage";
import { startFlow, processQueue } from "@/app/lib/agents";

setupTestDb();
beforeEach(async () => {
  await resetDb();
});

describe("lease ownership", () => {
  it("a superseded handler can neither extend the new owner's lease nor write a verdict or send follow-ups", async () => {
    const { runId, messageId } = await startFlow("catalog.refresh", { since: new Date().toISOString() }, { from: "cron" });
    const reclaimedAt = new Date(Date.now() - 1000);
    let heartbeatOwned: boolean | null = null;
    scoutImpl = async (opts) => {
      // Meanwhile another dispatcher reclaimed the message (lease looked stale): attempts bumped.
      await AgentMessage.updateOne({ _id: messageId }, { $set: { startedAt: reclaimedAt }, $inc: { attempts: 1 } });
      await opts.heartbeat();
      heartbeatOwned = ((await AgentMessage.findById(messageId).lean()) as any).startedAt.getTime() !== reclaimedAt.getTime();
      return done(null); // the old handler then tries to hand off jobs.ingested
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await processQueue({ runId });
    warn.mockRestore();
    expect(heartbeatOwned).toBe(false); // the heartbeat did not touch the new owner's lease
    const m: any = await AgentMessage.findById(messageId).lean();
    expect(m.status).toBe("processing"); // the new owner's state, untouched by the old handler
    expect(m.attempts).toBe(2);
    expect(m.startedAt.getTime()).toBe(reclaimedAt.getTime());
    expect(m.error || "").toBe("");
    expect(await AgentMessage.countDocuments({ runId, type: "jobs.ingested" })).toBe(0); // no duplicate fan-out
    expect(r.handled).toBe(0);
    expect(r.failed).toBe(0);
  });

  it("the owner's heartbeat renews the lease and its verdict lands", async () => {
    const { runId, messageId } = await startFlow("catalog.refresh", { since: new Date().toISOString() }, { from: "cron" });
    let renewed = false;
    scoutImpl = async (opts) => {
      const before = ((await AgentMessage.findById(messageId).lean()) as any).startedAt.getTime();
      await new Promise((res) => setTimeout(res, 5));
      await opts.heartbeat();
      renewed = ((await AgentMessage.findById(messageId).lean()) as any).startedAt.getTime() > before;
      return done(null);
    };
    await processQueue({ runId, max: 1 }); // just this message, not the chain it starts
    expect(renewed).toBe(true);
    expect(((await AgentMessage.findById(messageId).lean()) as any).status).toBe("done");
    expect(await AgentMessage.countDocuments({ runId, type: "jobs.ingested" })).toBe(1);
  });
});

describe("scout fan-out on retry", () => {
  it("does not queue a second next-chunk when an earlier attempt already did, even at a different offset", async () => {
    const { runId, messageId } = await startFlow("catalog.refresh", { since: new Date().toISOString() }, { from: "cron" });
    // An earlier attempt of this message got further (offset 7) and queued its follow-up before dying.
    await AgentMessage.create({ runId, from: "scout", to: "scout", type: "catalog.refresh", payload: { since: new Date().toISOString(), offset: 7 }, parentId: messageId, status: "queued" });
    scoutImpl = async (opts) => ((opts.offset ?? 0) === 0 ? done(5) : done(null));
    await processQueue({ runId, max: 1 }); // just the retried parent
    const children: any[] = await AgentMessage.find({ runId, type: "catalog.refresh", parentId: messageId }).lean();
    expect(children).toHaveLength(1);
    expect(children[0].payload.offset).toBe(7);
    const parent: any = await AgentMessage.findById(messageId).lean();
    expect(parent.status).toBe("done");
    expect(parent.result).toMatch(/already queued/);
  });

  it("passes a chunk budget bounded by the dispatcher's deadline", async () => {
    const seen: any[] = [];
    scoutImpl = async (opts) => {
      seen.push(opts);
      return done(null);
    };
    const { runId } = await startFlow("catalog.refresh", { since: new Date().toISOString() }, { from: "cron" });
    const before = Date.now();
    await processQueue({ runId, budgetMs: 20_000 });
    expect(seen).toHaveLength(1);
    expect(seen[0].timeBudgetMs).toBeLessThanOrEqual(20_000);
    expect(seen[0].deadlineAt).toBeLessThanOrEqual(before + 20_000);
    expect(seen[0].deadlineAt).toBeGreaterThan(before);
  });
});

describe("skipTypes (a runtime without the apply server)", () => {
  it("leaves those messages queued and does not count them as remaining work", async () => {
    const { runId } = await startFlow("apply.request", { userId: "507f1f77bcf86cd799439011", jobs: [], trigger: "retry" }, { from: "matcher" });
    const r = await processQueue({ runId, skipTypes: ["apply.request"] });
    expect(r).toMatchObject({ handled: 0, remaining: 0 });
    expect(((await AgentMessage.findOne({ runId }).lean()) as any).status).toBe("queued");
  });
});
