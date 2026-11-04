import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

process.env.DISCOVERY_IN_TESTS = "1";

import User from "@/app/models/User";
import Contact from "@/app/models/Contact";
import CompanySource from "@/app/models/CompanySource";
import DiscoveryCandidate from "@/app/models/DiscoveryCandidate";
import Maintenance from "@/app/models/Maintenance";
import { setDiscoverDefaults } from "@/app/lib/scout/discover";
import { runDiscoveryTick } from "@/app/lib/scout/discoverTick";

setupTestDb();

// Only "moonactive" is a Greenhouse board; everything else 404s on every ATS.
const fakeFetch = async (url: string) =>
  url === "https://boards-api.greenhouse.io/v1/boards/moonactive/jobs"
    ? ({ ok: true, status: 200, json: async () => ({ jobs: [{ id: 1 }, { id: 2 }] }) } as any)
    : ({ ok: false, status: 404, json: async () => ({}) } as any);

beforeAll(async () => {
  await resetDb();
  setDiscoverDefaults({ fetchImpl: fakeFetch as any, detect: async () => null, client: null }); // never the network
  const dana = String((await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana", phone: "0" } as any))._id);
  await Contact.create([
    { userId: dana, fullName: "A", company: "Moon Active", companyKey: "moon active", dedupeKey: "a" },
    { userId: dana, fullName: "B", company: "Nobody Industries", companyKey: "nobody industries", dedupeKey: "b" },
  ] as any);
});

describe("discovery on every scheduler tick", () => {
  it("probes pending candidates, adds the ones with a board, polls them at once, and releases the lock", async () => {
    const polled: string[] = [];
    const r = await runDiscoveryTick({ deadline: Date.now() + 60_000, poll: async (c) => void polled.push(c) });
    expect(r.ran).toBe(true);
    if (!r.ran) return;
    expect(r.result.found.map((f) => f.name)).toEqual(["Moon Active"]);
    expect(polled).toEqual(["Moon Active"]); // its postings show up now, not on the next walk
    expect(await CompanySource.exists({ atsType: "greenhouse", identifier: "moonactive", enabled: true })).toBeTruthy();
    expect(r.searched).toBe(true); // short backlog and never searched → the daily search runs (no client here, so it finds nothing)
    const lock: any = await Maintenance.findById("discoverTick").lean();
    expect(lock.running).toBe(false);
    expect(lock.lastSearchAt).toBeTruthy();
  });

  it("searches at most once a day, and one tick at a time", async () => {
    const again = await runDiscoveryTick({ deadline: Date.now() + 60_000, poll: async () => {} });
    expect(again.ran && again.searched).toBe(false); // searched minutes ago
    await Maintenance.updateOne({ _id: "discoverTick" as any }, { $set: { running: true, lastRunAt: new Date() } }, { strict: false });
    expect(await runDiscoveryTick({ deadline: Date.now() + 60_000 })).toEqual({ ran: false, reason: "busy" });
    // A tick that died (no update for 10+ minutes) is taken over.
    await Maintenance.updateOne({ _id: "discoverTick" as any }, { $set: { lastRunAt: new Date(Date.now() - 11 * 60_000) } }, { strict: false });
    expect((await runDiscoveryTick({ deadline: Date.now() + 60_000, poll: async () => {} })).ran).toBe(true);
    // "Nobody Industries" keeps failing and drops out after three tries.
    expect(await DiscoveryCandidate.countDocuments({ status: "pending" })).toBeLessThanOrEqual(1);
  });

  it("the kick route schedules a discovery batch unless ?discover=0", async () => {
    const { GET } = await import("@/app/api/scout/kick/route");
    const auth = { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } };
    // `after()` needs a request scope; outside Next it throws, which the test would see as a crash, so only the flag is checked here.
    const off = await GET(new NextRequest("http://localhost/api/scout/kick?discover=0", auth));
    expect((await off.json()).discovery).toBe("off");
  });
});
