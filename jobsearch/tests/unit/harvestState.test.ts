import { describe, it, expect } from "vitest";
import { harvestState, WEB_QUESTIONS_INFLIGHT_MS, WEB_QUESTIONS_RETRY_MS, WEB_QUESTIONS_TTL_DAYS } from "@/app/lib/interview/harvestState";

const NOW = Date.UTC(2026, 9, 25, 12);
const ago = (ms: number) => new Date(NOW - ms);

describe("web-questions harvest scheduling", () => {
  it("is due when never attempted", () => {
    expect(harvestState(null, NOW)).toEqual({ fresh: false, inFlight: false, backingOff: false, due: true });
  });

  it("is not due within the TTL, due after it", () => {
    expect(harvestState({ harvestedAt: ago(864e5) }, NOW).due).toBe(false);
    expect(harvestState({ harvestedAt: ago((WEB_QUESTIONS_TTL_DAYS + 1) * 864e5) }, NOW).due).toBe(true);
  });

  it("an in-flight marker blocks a second harvest until it expires", () => {
    const running = harvestState({ harvestStartedAt: ago(30_000) }, NOW);
    expect(running).toMatchObject({ inFlight: true, due: false });
    expect(harvestState({ harvestStartedAt: ago(WEB_QUESTIONS_INFLIGHT_MS + 1000) }, NOW)).toMatchObject({ inFlight: false, due: true });
  });

  it("backs off after a failed attempt, then retries", () => {
    expect(harvestState({ attemptedAt: ago(3600_000), error: "no research client" }, NOW)).toMatchObject({ backingOff: true, due: false });
    expect(harvestState({ attemptedAt: ago(WEB_QUESTIONS_RETRY_MS + 1000), error: "search failed" }, NOW)).toMatchObject({ backingOff: false, due: true });
    // A recent successful attempt (no error) is just fresh, not a back-off.
    expect(harvestState({ harvestedAt: ago(1000), attemptedAt: ago(1000), error: "" }, NOW)).toMatchObject({ fresh: true, backingOff: false, due: false });
  });
});
