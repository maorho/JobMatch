import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

vi.mock("@/app/lib/matcher/embeddings", async () => import("../setup/fakeEmbedder"));

import ExternalJobs from "@/app/models/ExternalJobs";
import User from "@/app/models/User";
import { embedPendingJobs } from "@/app/lib/matcher/embedJobs";
import { embedAndStoreResume } from "@/app/lib/matcher/candidateProfile";
import { rankForUser } from "@/app/lib/matcher/hybrid";
import { groupVariants, variantLabel } from "@/app/lib/jobs/variants";
import { titleKey } from "@/app/lib/jobs/enrich";
import { GET as searchGET } from "@/app/api/jobs/search/route";

setupTestDb();

const call = async (qs: string) => (await searchGET(new NextRequest(`http://localhost/api/jobs/search?${qs}`))).json();
const ext = (o: Partial<Record<string, unknown>>) => ({
  job: "Fullstack Engineer", company: "GitLab", city: "", country: "Remote", url: "https://x/" + Math.random(), finalUrl: "https://x/" + Math.random(),
  description: "React, Node.js, TypeScript", skills: [], seniority: [], source: "greenhouse", sourceJobId: String(Math.random()), postedAt: new Date("2026-11-10"),
  titleKey: titleKey(String(o.job || "Fullstack Engineer")), ...o,
});

let dana = "";
beforeAll(async () => {
  await resetDb();
  await ExternalJobs.insertMany([
    // The same role, three locations: one card, three variants, the newest listing in front.
    ext({ city: "Tel Aviv", country: "Israel", postedAt: new Date("2026-11-11"), sourceJobId: "fs-il" }),
    ext({ city: "Haifa", country: "Israel", postedAt: new Date("2026-11-10"), sourceJobId: "fs-haifa" }),
    ext({ city: "", country: "Remote", postedAt: new Date("2026-11-09"), sourceJobId: "fs-remote" }),
    // A different role at the same company, and a different company with the same title: not grouped.
    ext({ job: "Backend Engineer", city: "Tel Aviv", country: "Israel", postedAt: new Date("2026-11-08"), sourceJobId: "be" }),
    ext({ company: "Acme", city: "Jerusalem", country: "Israel", postedAt: new Date("2026-11-07"), sourceJobId: "acme" }),
  ]);
  dana = String((await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana", phone: "0", level: "junior" } as any))._id);
  await embedPendingJobs();
  await embedAndStoreResume(dana, "Junior fullstack developer with React, Node.js and TypeScript");
});

describe("one card per role, locations as variants", () => {
  it("groups rows by company and title key, keeping the list's order", () => {
    const rows = [{ _id: "1", company: "GitLab", job: "Fullstack Engineer", city: "Tel Aviv", country: "Israel" }, { _id: "2", company: "gitlab", job: "Fullstack Engineer", city: "Haifa" }, { _id: "3", company: "Acme", job: "Fullstack Engineer" }];
    const out = groupVariants(rows);
    expect(out.map((r) => r._id)).toEqual(["1", "3"]);
    expect(out[0].variants?.map((v) => v._id)).toEqual(["1", "2"]);
    expect(out[1].variants).toBeUndefined();
    expect(variantLabel({ _id: "x", city: "Tel Aviv", country: "Israel" })).toBe("Tel Aviv, Israel");
    expect(variantLabel({ _id: "x", remote: true })).toBe("Remote");
  });

  it("the catalogue listing shows the role once with its locations, and counts roles", async () => {
    const d = await call("limit=10");
    const gitlab = d.jobs.filter((j: any) => j.company === "GitLab" && j.job === "Fullstack Engineer");
    expect(gitlab).toHaveLength(1);
    expect(gitlab[0].city).toBe("Tel Aviv"); // the newest listing represents the group
    expect(gitlab[0].variants.map((v: any) => v.city || v.country)).toEqual(["Tel Aviv", "Haifa", "Remote"]);
    expect(d.jobs.map((j: any) => `${j.job}@${j.company}`)).toEqual(["Fullstack Engineer@GitLab", "Backend Engineer@GitLab", "Fullstack Engineer@Acme"]);
    expect(d.total).toBe(3);
    expect(d.pages).toBe(1);
  });

  it("a city filter keeps only that city's listing", async () => {
    const d = await call("city=Haifa");
    expect(d.jobs).toHaveLength(1);
    expect(d.jobs[0].city).toBe("Haifa");
    expect(d.jobs[0].variants).toBeUndefined();
    expect(d.total).toBe(1);
  });

  it("the personalised feed shows the role once, its best listing first", async () => {
    const { jobs, total } = await rankForUser(dana, { limit: 10, rerank: false });
    const fs = jobs.filter((j) => j.company === "GitLab" && j.job === "Fullstack Engineer");
    expect(fs).toHaveLength(1);
    expect(fs[0].variants).toHaveLength(3);
    expect(fs[0].variants![0]._id).toBe(fs[0]._id);
    expect(total).toBe(3);
  });
});
