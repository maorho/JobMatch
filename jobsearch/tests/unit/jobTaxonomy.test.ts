import { describe, it, expect } from "vitest";
import { seniorityOf, workModeOf } from "@/app/lib/jobTaxonomy";

// Pure unit tests — no database involved.
describe("seniorityOf", () => {
  it("buckets by title keywords", () => {
    expect(seniorityOf("Junior React Developer", [])).toBe("Junior");
    expect(seniorityOf("Senior Backend Engineer", [])).toBe("Senior");
    expect(seniorityOf("Software Engineering Intern", [])).toBe("Intern");
    expect(seniorityOf("Software Engineer", [])).toBe("Mid");
  });

  it("uses the ATS seniority field (Comeet experience_level)", () => {
    expect(seniorityOf("Software Engineer", ["Entry-level"])).toBe("Junior");
    expect(seniorityOf("Software Engineer", ["Senior"])).toBe("Senior");
    expect(seniorityOf("Software Engineer", ["Intermediate"])).toBe("Mid");
    expect(seniorityOf("Software Engineer", "Management")).toBe("Senior");
  });

  it("applies precedence Intern > Junior > Senior", () => {
    expect(seniorityOf("Student Intern - Data", [])).toBe("Intern");
    expect(seniorityOf("Junior to Senior Developer", [])).toBe("Junior");
  });

  it("handles edge inputs", () => {
    expect(seniorityOf(undefined, undefined)).toBe("Mid");
    expect(seniorityOf("", [])).toBe("Mid");
    expect(seniorityOf("Sr. Staff Engineer", [])).toBe("Senior");
    expect(seniorityOf("New Grad Software Engineer", [])).toBe("Junior");
    expect(seniorityOf("מפתח/ת Full Stack", [])).toBe("Mid");
  });
});

describe("workModeOf", () => {
  it("prefers an explicit internal `type`", () => {
    expect(workModeOf({ type: "Remote" })).toBe("Remote");
    expect(workModeOf({ type: "Hybrid" })).toBe("Hybrid");
    expect(workModeOf({ type: "On Site" })).toBe("On Site");
  });

  it("infers from location fields for ATS postings", () => {
    expect(workModeOf({ city: "Remote", country: "Israel" })).toBe("Remote");
    expect(workModeOf({ city: "Tel Aviv", country: "IL" })).toBe("On Site");
    expect(workModeOf({ city: "Israel - Hybrid (3 days)", country: "" })).toBe("Hybrid");
    expect(workModeOf({ city: "Remote - Hybrid", country: "" })).toBe("Remote");
  });

  it("ignores the description (boilerplate says 'remote' everywhere)", () => {
    expect(
      workModeOf({
        city: "Tel Aviv",
        country: "IL",
        description: "We are a remote-friendly company with hybrid options.",
      })
    ).toBe("On Site");
  });
});
