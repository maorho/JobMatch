import { describe, it, expect, vi } from "vitest";
import { memo, invalidate, snippet, cacheSize, PUBLIC_CACHE, PRIVATE_CACHE } from "@/app/lib/cache";

describe("in-process TTL cache", () => {
  it("computes once within the TTL, shares an in-flight call, and recomputes after expiry", async () => {
    invalidate();
    let calls = 0;
    const fn = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      return calls;
    };
    const [a, b] = await Promise.all([memo("k", 50, fn), memo("k", 50, fn)]);
    expect(a).toBe(1);
    expect(b).toBe(1); // second caller joined the first computation
    expect(await memo("k", 50, fn)).toBe(1);
    expect(calls).toBe(1);
    await new Promise((r) => setTimeout(r, 60));
    expect(await memo("k", 50, fn)).toBe(2);
    expect(cacheSize()).toBeGreaterThanOrEqual(1);
    expect(invalidate("k")).toBe(1);
  });

  it("does not cache failures", async () => {
    invalidate();
    const bad = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(memo("f", 1000, bad)).rejects.toThrow("boom");
    await expect(memo("f", 1000, bad)).rejects.toThrow("boom");
    expect(bad).toHaveBeenCalledTimes(2);
  });

  it("snippets cut on a word boundary and leave short text alone", () => {
    expect(snippet("short")).toBe("short");
    const long = ("React developer wanted. ").repeat(60);
    const s = snippet(long);
    expect(s.length).toBeLessThanOrEqual(481);
    expect(s.endsWith("…")).toBe(true);
    expect(s.slice(0, -1).endsWith(" ")).toBe(false);
    expect(snippet(undefined)).toBe("");
    expect(PUBLIC_CACHE["Cache-Control"]).toMatch(/public/);
    expect(PRIVATE_CACHE["Cache-Control"]).toMatch(/private, no-store/);
  });
});
