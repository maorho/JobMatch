import { describe, it, expect } from "vitest";
import { inferCandidateLevel, levelFit, freshnessBoost, yearsLevel, yearsCap, applyLevel } from "@/app/lib/matcher/level";
import { rrf } from "@/app/lib/matcher/hybrid";

describe("candidate level", () => {
  it("reads the level off the résumé", () => {
    expect(inferCandidateLevel("B.Sc. graduate 2024, student projects in React, looking for a junior position")).toBe("junior");
    expect(inferCandidateLevel("Full-stack developer, 2 years of experience with Node.js", "Fullstack Developer")).toBe("junior");
    expect(inferCandidateLevel("Backend engineer with 4 years of experience in Go and Kubernetes")).toBe("mid");
    expect(inferCandidateLevel("Senior engineer, 8 years, led a team of 5")).toBe("senior");
    expect(inferCandidateLevel("Tech lead with 4 years, architect of the payments platform")).toBe("senior");
    expect(inferCandidateLevel("")).toBe("junior");
  });

  it("scores level compatibility so seniors' jobs sink for juniors and vice versa", () => {
    expect(levelFit("junior", "Junior React Developer")).toBe(1);
    expect(levelFit("junior", "Senior Backend Engineer")).toBeLessThan(0.3);
    expect(levelFit("junior", "Software Engineer")).toBeGreaterThan(0.5); // untitled level = Mid in the taxonomy
    expect(levelFit("senior", "Junior QA")).toBeLessThan(0.4);
    expect(levelFit("senior", "Staff Engineer")).toBe(1);
    expect(levelFit("mid", "Intern")).toBeLessThan(0.5);
  });

  it("reads the level off the years a posting asks for, not only its title", () => {
    // "Full Stack Engineer · 8+ years" is a senior role for a junior even though the title says nothing.
    expect(levelFit("junior", "Full Stack Engineer", undefined, 8)).toBeLessThan(0.1);
    expect(levelFit("junior", "Software Engineer", undefined, 5)).toBe(levelFit("junior", "Senior Software Engineer"));
    expect(levelFit("junior", "Software Engineer", undefined, 3)).toBe(0.55);
    expect(levelFit("junior", "Software Engineer", undefined, 1)).toBe(1);
    expect(levelFit("junior", "Software Engineer", undefined, null)).toBe(0.55);
    // The stricter signal wins: a "Junior" title with 5 years asked is still out of reach; a "Senior" title with 2 years asked is still senior.
    expect(levelFit("junior", "Junior Developer", undefined, 5)).toBe(0.15);
    expect(levelFit("junior", "Senior Developer", undefined, 2)).toBe(0.15);
    // Interns are interns whatever the years field says; seniors are not below an "8+" posting.
    expect(levelFit("junior", "Software Intern", undefined, 8)).toBe(0.9);
    expect(levelFit("senior", "Software Engineer", undefined, 8)).toBeGreaterThanOrEqual(0.8);
    expect(levelFit("mid", "Software Engineer", undefined, 8)).toBeLessThan(0.4);
    expect(yearsLevel(null)).toBeNull();
    expect(yearsLevel(8)).toBe("Lead");
  });

  it("caps a verdict by the years the posting asks for", () => {
    expect(yearsCap("junior", 8)).toBe(30);
    expect(yearsCap("junior", 5)).toBe(30);
    expect(yearsCap("junior", 3)).toBe(65);
    expect(yearsCap("junior", 2)).toBeNull();
    expect(yearsCap("junior", null)).toBeNull();
    expect(yearsCap("mid", 8)).toBe(30);
    expect(yearsCap("mid", 5)).toBe(65);
    expect(yearsCap("senior", 8)).toBeNull();
    expect(applyLevel(80, 1)).toBe(80);
    expect(applyLevel(80, 0.08)).toBeLessThan(45);
  });

  it("boosts fresh postings a little and old ones not at all", () => {
    expect(freshnessBoost(new Date())).toBe(0.06);
    expect(freshnessBoost(new Date(Date.now() - 5 * 864e5))).toBe(0.04);
    expect(freshnessBoost(new Date(Date.now() - 60 * 864e5))).toBe(0);
    expect(freshnessBoost(null)).toBe(0);
  });
});

describe("reciprocal rank fusion", () => {
  it("rewards items that rank well in both lists", () => {
    const fused = rrf([[{ _id: "a" }, { _id: "b" }, { _id: "c" }], [{ _id: "c" }, { _id: "a" }, { _id: "d" }]]);
    const order = [...fused.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id);
    expect(order[0]).toBe("a"); // 1st + 2nd
    expect(order[1]).toBe("c"); // 3rd + 1st
    expect(order).toContain("d");
    expect(fused.get("b")!).toBeLessThan(fused.get("c")!);
  });
});

describe("toMatchScore (cosine → 0–100)", () => {
  it("spreads the real text-embedding-3 band instead of saturating it, and never calls semantics alone a strong fit", async () => {
    const { toMatchScore } = await import("@/app/lib/matcher/cosine");
    expect(toMatchScore(0.755)).toBeGreaterThanOrEqual(45);
    expect(toMatchScore(0.814)).toBeLessThanOrEqual(70);
    expect(toMatchScore(0.814)).toBeGreaterThan(toMatchScore(0.773));
    expect(toMatchScore(0.773)).toBeGreaterThan(toMatchScore(0.755));
    expect(toMatchScore(0.84)).toBeLessThan(85);
    expect(toMatchScore(0.2)).toBe(0);
    expect(toMatchScore(1)).toBe(100);
    for (const c of [0.3, 0.5, 0.7, 0.86]) expect(toMatchScore(c + 0.001)).toBeGreaterThanOrEqual(toMatchScore(c)); // monotonic across knots
  });
});
