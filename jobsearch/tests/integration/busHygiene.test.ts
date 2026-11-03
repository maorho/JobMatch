import { describe, it, expect, beforeAll, vi } from "vitest";
import { setupTestDb, resetDb } from "../setup/mongo";

vi.mock("@/app/lib/matcher/embeddings", async () => import("../setup/fakeEmbedder"));

import mongoose from "mongoose";
import CompanySource from "@/app/models/CompanySource";
import AgentMessage from "@/app/models/AgentMessage";
import AgentRun from "@/app/models/AgentRun";
import { runScout } from "@/app/lib/scout/runScout";
import { startFlow, processQueue, readRun } from "@/app/lib/agents";

setupTestDb();

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

beforeAll(async () => {
  await resetDb();
});

describe("several walkers share the catalogue", () => {
  it("runScout skips a source polled a moment ago but still counts it, so offsets stay stable", async () => {
    await CompanySource.create([
      { companyName: "Fresh", atsType: "greenhouse", identifier: "fresh", enabled: true, lastPolledAt: minutesAgo(5) },
      { companyName: "Stale", atsType: "greenhouse", identifier: "stale", enabled: true, lastPolledAt: minutesAgo(120) },
    ] as any);
    const r = await runScout({ dry: true, skipPolledWithinMs: 30 * 60_000, sourceDeadlineMs: 2000 });
    expect(r.processed).toBe(2);
    expect(r.nextOffset).toBeNull();
    const byName = Object.fromEntries(r.results.map((x) => [x.company, x]));
    expect(byName.Fresh.skipped).toBe(true);
    expect(byName.Stale.skipped).toBeUndefined(); // attempted (the fake board 404s; that is a poll, not a skip)
    const none = await runScout({ dry: true, sourceDeadlineMs: 2000 });
    expect(none.results.every((x) => !x.skipped)).toBe(true); // without the option nothing is skipped
  });
});

describe("bus hygiene", () => {
  it("a message queued for over a week is closed as expired and its run settles", async () => {
    const run = await AgentRun.create({ title: "Old walk", flow: "catalog.refresh", status: "running", startedBy: "admin:test" } as any);
    await AgentMessage.collection.insertOne({ runId: run._id, from: "scout", to: "locator", type: "jobs.ingested", payload: {}, status: "queued", attempts: 0, priority: 0, createdAt: new Date(Date.now() - 8 * 24 * 3600_000), updatedAt: new Date() } as any);
    const freshRun = await AgentRun.create({ title: "Fresh", flow: "catalog.refresh", status: "running", startedBy: "admin:test" } as any);
    await AgentMessage.collection.insertOne({ runId: freshRun._id, from: "scout", to: "nobody", type: "jobs.ingested", payload: {}, status: "queued", attempts: 0, priority: 0, createdAt: new Date(), updatedAt: new Date() } as any);
    await processQueue({ budgetMs: 10_000, runId: String(run._id) });
    const old: any = await AgentMessage.findOne({ runId: run._id }).lean();
    expect(old.status).toBe("failed");
    expect(old.error).toMatch(/expired/);
    expect(((await AgentRun.findById(run._id).lean()) as any).status).toBe("failed");
    const fresh: any = await AgentMessage.findOne({ runId: freshRun._id }).lean();
    expect(fresh.status).not.toBe("failed"); // only week-old messages expire (this one was claimed, not expired)
    expect(fresh.error || "").not.toMatch(/expired/);
  });

  it("a second full catalogue walk yields to the one already in progress", async () => {
    await AgentMessage.deleteMany({});
    await AgentRun.deleteMany({});
    await CompanySource.deleteMany({});
    const older = await startFlow("catalog.refresh", { since: new Date().toISOString() }, { from: "user", startedBy: "admin:test", title: "Walk A" });
    // Keep the older walk "in progress" while the newer one is handled: its message stays queued because we drain only the newer run.
    const newer = await startFlow("catalog.refresh", { since: new Date().toISOString() }, { from: "user", startedBy: "admin:test", title: "Walk B" });
    expect(new mongoose.Types.ObjectId(older.runId) < new mongoose.Types.ObjectId(newer.runId)).toBe(true);
    await processQueue({ budgetMs: 10_000, runId: newer.runId });
    const b = await readRun(newer.runId);
    expect(b.run.status).toBe("done");
    expect(b.messages).toHaveLength(1); // no next chunk, no hand-off: it stopped
    expect(b.messages[0].result).toMatch(/already in progress/);
    const aMsg: any = await AgentMessage.findOne({ runId: older.runId }).lean();
    expect(aMsg.status).toBe("queued"); // the older walk is untouched
  });
});
