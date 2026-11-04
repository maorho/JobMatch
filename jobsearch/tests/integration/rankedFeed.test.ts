import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

vi.mock("@/app/lib/matcher/embeddings", async () => import("../setup/fakeEmbedder"));
// Persistence is off under test by default (suites expect fresh ranks); this suite is about it.
process.env.FEED_PERSIST_IN_TESTS = "1";
process.env.FEED_WARM_IN_TESTS = "1";

import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import RankedFeed from "@/app/models/RankedFeed";
import { embedPendingJobs } from "@/app/lib/matcher/embedJobs";
import { embedAndStoreResume } from "@/app/lib/matcher/candidateProfile";
import { rankForUser } from "@/app/lib/matcher/hybrid";
import { warmFeedForUser, loadRankedFeed, invalidateRankedFeed } from "@/app/lib/matcher/rankedFeed";
import { invalidate } from "@/app/lib/cache";
import { signJwt } from "@/app/lib/jwt";
import { GET as meGET } from "@/app/api/auth/me/route";
import { GET as feedGET } from "@/app/api/matcher/feed/route";

setupTestDb();

const job = (title: string, description: string) => ({ job: title, company: "Acme", city: "Tel Aviv", country: "Israel", url: "https://x/" + title, finalUrl: "https://x/" + title, description, skills: [], seniority: [], source: "greenhouse", sourceJobId: title, postedAt: new Date() });
let dana = "", token = "";
beforeAll(async () => {
  await resetDb();
  await ExternalJobs.create(job("Junior React Developer", "React TypeScript frontend"));
  await ExternalJobs.create(job("Junior Vue Developer", "Vue TypeScript frontend"));
  await ExternalJobs.create(job("Data Scientist", "Python pandas ML"));
  await embedPendingJobs();
  dana = String((await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana", phone: "0" } as any))._id);
  token = await signJwt({ id: dana });
});
const authed = (url: string) => new NextRequest(`http://localhost${url}`, { headers: { cookie: `token=${token}` } } as any);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("background feed warm-up", () => {
  it("does nothing for a person without a résumé", async () => {
    expect(await warmFeedForUser(dana)).toBe("no-profile");
    expect(await RankedFeed.countDocuments({ userId: dana })).toBe(0); // the placeholder is gone, no list was stored
  });

  it("ranks once in the background and the jobs page reads the stored list", async () => {
    await embedAndStoreResume(dana, "Junior frontend developer React TypeScript Vue");
    await sleep(50); // the résumé update scheduled a warm-up of its own; let it settle
    invalidate(`rank:${dana}:`);
    expect(["computed", "fresh"]).toContain(await warmFeedForUser(dana));
    const rows: any[] = await RankedFeed.find({ userId: dana }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ isDefault: true });
    expect(rows[0].key).toMatch(new RegExp(`^rank:${dana}:`));
    expect(rows[0].warmingAt).toBeUndefined();
    expect(rows[0].count).toBeGreaterThanOrEqual(2);
    const storedBytes = typeof rows[0].blob.length === "function" ? rows[0].blob.length() : rows[0].blob.length; // bson Binary vs Buffer
    expect(storedBytes).toBeLessThan(JSON.stringify(await loadRankedFeed(dana, rows[0].key)).length); // stored gzipped
    expect(await loadRankedFeed(dana, rows[0].key)).toHaveLength(rows[0].count);

    // A second warm-up is a no-op; the feed on a "cold instance" (memo cleared) is served from Mongo without re-ranking.
    expect(await warmFeedForUser(dana)).toBe("fresh");
    invalidate(`rank:${dana}:`);
    await ExternalJobs.create(job("Junior Angular Developer", "Angular TypeScript frontend"));
    await embedPendingJobs();
    const page = await rankForUser(dana, { limit: 10 });
    expect(page.jobs.map((j) => j.job)).not.toContain("Junior Angular Developer"); // stored list, not a fresh rank
    const res = await feedGET(authed("/api/matcher/feed?limit=10"));
    const body = await res.json();
    expect(body.personalized).toBe(true);
    expect(body.jobs.map((j: any) => j.job)).toEqual(page.jobs.map((j) => j.job));
  });

  it("a new résumé drops the stored list and the next rank sees the catalog again", async () => {
    await embedAndStoreResume(dana, "Junior frontend developer Angular React TypeScript");
    await sleep(300); // scheduleFeedWarm runs the warm-up right away outside a request scope
    const rows: any[] = await RankedFeed.find({ userId: dana }).lean();
    expect(rows).toHaveLength(1); // the old version's row is gone, the new one is in
    expect((await loadRankedFeed(dana, rows[0].key))!.map((j) => j.job)).toContain("Junior Angular Developer");
    await invalidateRankedFeed(dana);
    expect(await RankedFeed.countDocuments({ userId: dana })).toBe(0);
  });

  it("/api/auth/me schedules a warm-up without slowing the response", async () => {
    const res = await meGET(authed("/api/auth/me"));
    expect(res.status).toBe(200);
    await sleep(300);
    expect(await RankedFeed.countDocuments({ userId: dana, isDefault: true })).toBe(1);
  });

  it("parallel warm-ups share one computation", async () => {
    await invalidateRankedFeed(dana);
    invalidate(`rank:${dana}:`);
    const results = await Promise.all([warmFeedForUser(dana), warmFeedForUser(dana), warmFeedForUser(dana)]);
    expect(results.filter((r) => r === "computed")).toHaveLength(1);
    expect(results.filter((r) => r === "warming-elsewhere")).toHaveLength(2);
    expect(await RankedFeed.countDocuments({ userId: dana })).toBe(1);
  });

  it("feed?posted=<days> keeps only recent postings, still ranked by match", async () => {
    const day = 86_400_000;
    await ExternalJobs.create({ ...job("Junior React Developer old", "React TypeScript frontend"), postedAt: new Date(Date.now() - 40 * day), firstSeenAt: new Date(Date.now() - 40 * day) });
    await ExternalJobs.create({ ...job("Junior React Developer undated", "React TypeScript frontend"), postedAt: null, firstSeenAt: new Date(Date.now() - 2 * day) });
    await embedPendingJobs();
    // A new résumé drops the stored default list and warms a fresh one that sees both new postings.
    await embedAndStoreResume(dana, "Junior frontend developer React TypeScript");
    await sleep(300);
    invalidate(`rank:${dana}:`);
    const all = await (await feedGET(authed("/api/matcher/feed?limit=20"))).json();
    expect(all.jobs.map((j: any) => j.job)).toContain("Junior React Developer old");
    const recent = await (await feedGET(authed("/api/matcher/feed?limit=20&posted=7"))).json();
    expect(recent.personalized).toBe(true);
    expect(recent.posted).toBe(7);
    const names = recent.jobs.map((j: any) => j.job);
    expect(names).not.toContain("Junior React Developer old");
    expect(names).toContain("Junior React Developer undated"); // no employer date: first seen 2 days ago counts
    expect(names).toContain("Junior React Developer");
    for (let i = 1; i < recent.jobs.length; i++) expect(recent.jobs[i - 1].matchScore).toBeGreaterThanOrEqual(recent.jobs[i].matchScore);
    expect(await RankedFeed.countDocuments({ userId: dana, isDefault: true })).toBeLessThanOrEqual(1); // a filtered list is never the warmed default
  });

  it("a date view is ranked fresh (cached verdicts only) and persisted; the warm-up refreshes a stored list the memo still holds", async () => {
    await ExternalJobs.create(job("Junior React Developer newest", "React TypeScript frontend"));
    await embedPendingJobs();
    invalidate(`rank:${dana}:`);
    const view = await (await feedGET(authed("/api/matcher/feed?limit=20&posted=7"))).json();
    expect(view.personalized).toBe(true);
    const names = view.jobs.map((j: any) => j.job);
    expect(names).toContain("Junior React Developer newest"); // the window is ranked now, not cut from an older list
    expect(names).not.toContain("Junior React Developer old");
    expect(await RankedFeed.countDocuments({ userId: dana, isDefault: false })).toBeGreaterThanOrEqual(1); // persisted like any other list (keys carry the window start)
    // The background warm-up must not be answered from the memo it is meant to refresh.
    const before: any = await RankedFeed.findOne({ userId: dana, isDefault: true }).select("computedAt").lean();
    await RankedFeed.updateOne({ _id: before._id }, { $set: { computedAt: new Date(Date.now() - 20 * 60_000) } }); // older than fresh, memo still warm
    await rankForUser(dana, { limit: 10 }); // fills the memo
    expect(await warmFeedForUser(dana)).toBe("computed");
    const after: any = await RankedFeed.findOne({ userId: dana, isDefault: true }).select("computedAt count").lean();
    expect(after.computedAt.getTime()).toBeGreaterThan(Date.now() - 5_000);
    expect(after.count).toBeGreaterThan(0);
  });
});
