import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";
import CompanySource from "@/app/models/CompanySource";
import Maintenance from "@/app/models/Maintenance";
import { catalogueIsStale, claimWalk, heartbeat, releaseWalk, kickScoutIfStale, selfDriveEnabled, SCOUT_STALE_MIN } from "@/app/lib/scout/selfDrive";
import { GET as scoutGET } from "@/app/api/scout/run/route";
import { GET as kickGET } from "@/app/api/scout/kick/route";

setupTestDb();

const cron = (qs: string) => new NextRequest(`http://localhost/api/scout/run?${qs}`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

beforeAll(async () => {
  await resetDb();
});

describe("self-driving scout: when is the catalogue stale", () => {
  it("is never stale without enabled sources, stale when the newest poll is old, fresh after a recent poll", async () => {
    expect(await catalogueIsStale()).toBe(false); // nothing to poll
    await CompanySource.create({ companyName: "Acme", atsType: "greenhouse", identifier: "acme", enabled: true, lastPolledAt: minutesAgo(SCOUT_STALE_MIN + 5) } as any);
    expect(await catalogueIsStale()).toBe(true);
    await CompanySource.create({ companyName: "Beta", atsType: "lever", identifier: "beta", enabled: true, lastPolledAt: minutesAgo(1) } as any);
    expect(await catalogueIsStale()).toBe(false); // the newest poll counts
    await CompanySource.create({ companyName: "Never", atsType: "lever", identifier: "never", enabled: true } as any);
    expect(await catalogueIsStale()).toBe(false); // an unpolled source does not by itself make the catalogue stale
  });
});

describe("self-driving scout: one walk at a time", () => {
  it("claims the lock once, heartbeats only for the live walk, takes over a dead walk, and releases", async () => {
    const a = await claimWalk();
    expect(a).toBeTruthy();
    expect(await claimWalk()).toBeNull(); // held
    expect(await heartbeat(a!)).toBe(true);
    expect(await heartbeat("someone-else")).toBe(false);
    // The holder died: no heartbeat for longer than the stale window → a new walk may take over.
    await Maintenance.collection.updateOne({ _id: "scoutWalk" as any }, { $set: { updatedAt: minutesAgo(25) } });
    const b = await claimWalk();
    expect(b).toBeTruthy();
    expect(b).not.toBe(a);
    expect(await heartbeat(a!)).toBe(false); // the old walk is superseded
    expect(await heartbeat(b!)).toBe(true);
    await releaseWalk(b!);
    const row: any = await Maintenance.findById("scoutWalk").lean();
    expect(row.running).toBe(false);
    expect(await claimWalk()).toBeTruthy(); // free again
  });

  it("a chunk of a superseded walk polls nothing", async () => {
    const live = await claimWalk().catch(() => null); // may already be held by the test above; either way "stale-walk" is not it
    const res = await scoutGET(cron("offset=0&limit=5&budget=5&walk=stale-walk&n=3"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, skipped: "walk superseded", nextOffset: null });
    if (live) await releaseWalk(live);
  });

  it("is off under test and reports so", async () => {
    expect(selfDriveEnabled()).toBe(false);
    expect(await kickScoutIfStale()).toBe("off");
  });

  it("the scheduler endpoint needs the cron secret and answers 200 with the kick result", async () => {
    const anon = await kickGET(new NextRequest("http://localhost/api/scout/kick"));
    expect(anon.status).toBe(401);
    const res = await kickGET(new NextRequest("http://localhost/api/scout/kick?staleMin=20", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ result: "off", staleMin: 20 });
    const clamped = await kickGET(new NextRequest("http://localhost/api/scout/kick?staleMin=1", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
    expect((await clamped.json()).staleMin).toBe(SCOUT_STALE_MIN); // under 5 min is ignored
  });
});
