import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FEATURES, featureSnapshot, applyServerConfigured } from "@/app/lib/flags";

const KEYS = ["FEATURE_PHONE", "FEATURE_AUTO_APPLY", "FEATURE_MCP", "PUPPETEER_SERVER_URL", "SCRAPER_TOKEN"] as const;
const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  vi.unstubAllEnvs();
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("feature flags", () => {
  it("phone is off unless FEATURE_PHONE=1", () => {
    expect(FEATURES.phone).toBe(false);
    process.env.FEATURE_PHONE = "1";
    expect(FEATURES.phone).toBe(true);
  });

  it("autoApply defaults to 'on only when PUPPETEER_SERVER_URL is set'", () => {
    expect(FEATURES.autoApply).toBe(false);
    process.env.PUPPETEER_SERVER_URL = "https://apply.example.com";
    expect(FEATURES.autoApply).toBe(true);
  });

  it("FEATURE_AUTO_APPLY overrides the server-url default in both directions", () => {
    process.env.FEATURE_AUTO_APPLY = "1";
    expect(FEATURES.autoApply).toBe(true);
    process.env.PUPPETEER_SERVER_URL = "https://apply.example.com";
    process.env.FEATURE_AUTO_APPLY = "0";
    expect(FEATURES.autoApply).toBe(false);
  });

  it("accepts true/false alongside 1/0", () => {
    process.env.FEATURE_PHONE = "true";
    expect(FEATURES.phone).toBe(true);
    process.env.FEATURE_MCP = "false";
    expect(FEATURES.mcp).toBe(false);
    process.env.PUPPETEER_SERVER_URL = "https://apply.example.com";
    process.env.FEATURE_AUTO_APPLY = "false";
    expect(FEATURES.autoApply).toBe(false);
    process.env.FEATURE_AUTO_APPLY = "yes"; // unknown → default
    expect(FEATURES.autoApply).toBe(true);
  });

  it("in production the apply server needs SCRAPER_TOKEN to count as configured, even when forced on", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.PUPPETEER_SERVER_URL = "https://apply.example.com";
    expect(applyServerConfigured()).toBe(false);
    expect(FEATURES.autoApply).toBe(false);
    process.env.FEATURE_AUTO_APPLY = "1";
    expect(FEATURES.autoApply).toBe(false);
    process.env.SCRAPER_TOKEN = "token-12345";
    expect(applyServerConfigured()).toBe(true);
    expect(FEATURES.autoApply).toBe(true);
  });

  it("an empty PUPPETEER_SERVER_URL counts as unset", () => {
    process.env.PUPPETEER_SERVER_URL = "";
    expect(FEATURES.autoApply).toBe(false);
  });

  it("mcp is on unless FEATURE_MCP=0, and the snapshot reads the live values", () => {
    expect(FEATURES.mcp).toBe(true);
    process.env.FEATURE_MCP = "0";
    expect(featureSnapshot()).toEqual({ phone: false, autoApply: false, mcp: false });
  });
});
