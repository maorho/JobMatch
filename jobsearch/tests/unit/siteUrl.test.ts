import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { siteUrl, absolute } from "@/app/lib/seo/site";

beforeEach(() => {
  vi.stubEnv("APP_URL", "");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("VERCEL_URL", "");
  vi.stubEnv("VERCEL_BRANCH_URL", "");
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

  it("uses the Vercel preview origin when APP_URL is unset (branch URL first)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "jm-abc123.vercel.app");
    expect(siteUrl()).toBe("https://jm-abc123.vercel.app");
    vi.stubEnv("VERCEL_BRANCH_URL", "jm-git-feat-x.vercel.app");
    expect(siteUrl()).toBe("https://jm-git-feat-x.vercel.app");
    vi.stubEnv("APP_URL", "https://preview.example.com");
    expect(siteUrl()).toBe("https://preview.example.com");
  });

  it("never leaks localhost in production: logs and returns an empty origin", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    expect(siteUrl()).toBe("");
    expect(absolute("/sitemap.xml")).toBe("/sitemap.xml");
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/APP_URL is not set in production/));
  });

  it("does not use VERCEL_URL on Vercel production", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_URL", "jm-abc123.vercel.app");
    expect(siteUrl()).toBe("");
  });
});
