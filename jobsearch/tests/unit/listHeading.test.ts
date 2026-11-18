import { describe, it, expect } from "vitest";
import { listHeading } from "@/app/lib/jobs/listHeading";

const base = { fetchedOnce: true, loading: false, page: 1, count: 121, catalogTotal: 3249, signedIn: false, searching: true };

describe("the line above the job list", () => {
  it("never shows a count — least of all zero — before a list request has completed", () => {
    // Full reload of /jobs?seniority=Junior: state before the first request, during it, and after it.
    expect(listHeading({ ...base, fetchedOnce: false, loading: false, count: 0 }).key).toBe("home.searching");
    expect(listHeading({ ...base, fetchedOnce: false, loading: true, count: 0 }).key).toBe("home.searching");
    expect(listHeading({ ...base, count: 121 })).toEqual({ key: "home.showing", vars: { n: "121" }, rankedSuffix: false });
    // A real zero, after a completed request, is shown as zero.
    expect(listHeading({ ...base, count: 0 })).toEqual({ key: "home.showing", vars: { n: "0" }, rankedSuffix: false });
    // Page 2 loading keeps the count of what is already on screen.
    expect(listHeading({ ...base, loading: true, page: 2 }).key).toBe("home.showing");
  });

  it("the personalised feed says 'X of N' with the catalogue's roles as N", () => {
    expect(listHeading({ ...base, signedIn: true, searching: false, count: 23 })).toEqual({ key: "home.bestMatches", vars: { n: "23", total: "3,249" }, rankedSuffix: false });
    expect(listHeading({ ...base, signedIn: true, searching: false, count: 3249 })).toEqual({ key: "home.showing", vars: { n: "3,249" }, rankedSuffix: true });
  });
});
