import { describe, it, expect } from "vitest";
import { isIsraelOrRemote } from "@/app/lib/scout/locationFilter";

describe("isIsraelOrRemote", () => {
  it("keeps Israeli postings by country code or name", () => {
    expect(isIsraelOrRemote({ city: "Tel Aviv", country: "IL" })).toBe(true);
    expect(isIsraelOrRemote({ city: "Haifa", country: "Israel" })).toBe(true);
    expect(isIsraelOrRemote({ city: "Herzliya", country: "" })).toBe(true);
    expect(isIsraelOrRemote({ city: "", country: "ISR" })).toBe(true);
    expect(isIsraelOrRemote({ city: "ירושלים", country: "ישראל" })).toBe(true);
  });

  it("keeps remote postings anywhere", () => {
    expect(isIsraelOrRemote({ city: "Remote", country: "United States" })).toBe(true);
    expect(isIsraelOrRemote({ city: "London", country: "UK", title: "Engineer (Remote)" })).toBe(true);
    expect(isIsraelOrRemote({ city: "Berlin", country: "DE", description: "Work from home" })).toBe(true);
  });

  it("drops non-Israel, non-remote postings", () => {
    expect(isIsraelOrRemote({ city: "New York", country: "US" })).toBe(false);
    expect(isIsraelOrRemote({ city: "Vilnius", country: "Lithuania" })).toBe(false);
    expect(isIsraelOrRemote({ city: "", country: "Unknown" })).toBe(false);
    expect(isIsraelOrRemote({})).toBe(false);
  });

  it("does not match on substrings of other words", () => {
    // "remoteness" / "Israeli" inside unrelated words shouldn't flip the filter
    // unless it's a real location signal; "Carmel-by-the-Sea" is not Israel.
    expect(isIsraelOrRemote({ city: "Carmel-by-the-Sea", country: "US" })).toBe(false);
  });

  it("only reads the first 600 chars of the description", () => {
    const longDesc = "x".repeat(700) + " remote";
    expect(isIsraelOrRemote({ city: "Austin", country: "US", description: longDesc })).toBe(false);
  });
});
