import { describe, it, expect } from "vitest";
import { inferCandidateLevel, levelFit, freshnessBoost } from "@/app/lib/matcher/level";
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
