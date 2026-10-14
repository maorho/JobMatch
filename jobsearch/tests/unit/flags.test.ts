import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FEATURES, featureSnapshot } from "@/app/lib/flags";

const KEYS = ["FEATURE_PHONE", "FEATURE_AUTO_APPLY", "FEATURE_MCP", "PUPPETEER_SERVER_URL"] as const;
const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
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

  it("mcp is on unless FEATURE_MCP=0, and the snapshot reads the live values", () => {
    expect(FEATURES.mcp).toBe(true);
    process.env.FEATURE_MCP = "0";
    expect(featureSnapshot()).toEqual({ phone: false, autoApply: false, mcp: false });
  });
});
