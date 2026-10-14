import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { siteUrl, absolute } from "@/app/lib/seo/site";

beforeEach(() => {
  vi.stubEnv("APP_URL", "");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("siteUrl", () => {
  it("prefers APP_URL, strips a trailing slash, and builds absolute URLs", () => {
    vi.stubEnv("APP_URL", "https://job-match-six.vercel.app/");
    expect(siteUrl()).toBe("https://job-match-six.vercel.app");
    expect(absolute("/job/x/1")).toBe("https://job-match-six.vercel.app/job/x/1");
    expect(absolute("https://elsewhere.test/p")).toBe("https://elsewhere.test/p");
  });

  it("falls back to localhost outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(siteUrl()).toBe("http://localhost:3000");
  });

  it("never leaks localhost in production: logs and returns an empty origin", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    expect(siteUrl()).toBe("");
    expect(absolute("/sitemap.xml")).toBe("/sitemap.xml");
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/APP_URL is not set in production/));
  });
});
