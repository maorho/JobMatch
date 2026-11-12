import { describe, it, expect, beforeAll } from "vitest";
import { setupTestDb, resetDb } from "../setup/mongo";
import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import { computeSkillGap } from "@/app/lib/skills/gap";

setupTestDb();

// 20 junior frontend postings in Tel Aviv: TypeScript in 14, Jest in 8, React in all.
const job = (i: number) => ({
  job: "Junior Frontend Developer",
  company: "Acme",
  city: "Tel Aviv",
  country: "Israel",
  source: "greenhouse",
  sourceJobId: `j${i}`,
  url: `https://x/${i}`,
  finalUrl: `https://x/${i}`,
  description: "x",
  skills: [],
  seniority: [],
  postedAt: new Date(),
  tech: ["React", ...(i < 14 ? ["TypeScript"] : []), ...(i < 8 ? ["Jest"] : [])],
});

let dana = "", noResume = "";
beforeAll(async () => {
  await resetDb();
  await ExternalJobs.insertMany(Array.from({ length: 20 }, (_, i) => job(i)));
  dana = String((await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana", phone: "0", resumeText: "Junior frontend developer, 1 year with React and CSS", level: "junior" } as any))._id);
  noResume = String((await User.create({ username: "noor", email: "noor@test.dev", password: "x", fullname: "Noor", phone: "0" } as any))._id);
});

describe("skill gap vs the market", () => {
  it("counts demand per technology in the user's slice and marks what the résumé has", async () => {
    const gap = (await computeSkillGap(dana))!;
    expect(gap.slice).toMatchObject({ roles: ["frontend"], level: "junior", jobs: 20 });
    expect(gap.widened).toBeNull();
    const by = Object.fromEntries(gap.skills.map((s) => [s.name, s]));
    expect(by.TypeScript).toMatchObject({ count: 14, demandPct: 70, have: false });
    expect(by.Jest).toMatchObject({ count: 8, demandPct: 40, have: false });
    expect(by.React).toMatchObject({ count: 20, demandPct: 100, have: true });
    expect(gap.skills[0].name).toBe("React"); // sorted by demand
  });

  it("returns null without a résumé", async () => {
    expect(await computeSkillGap(noResume)).toBeNull();
  });

  it("widens a slice that is too small: first the cities, then the level", async () => {
    await User.updateOne({ _id: dana }, { $set: { searchProfile: { roles: ["frontend"], level: "junior", cities: ["Haifa"] } } });
    const gap = (await computeSkillGap(dana))!;
    expect(gap.widened).toBe("cities"); // no Haifa postings → the whole country
    expect(gap.slice.jobs).toBe(20);
  });
});
