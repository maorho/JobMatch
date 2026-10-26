import { describe, it, expect, vi, afterEach } from "vitest";
import { checkEnv, validateEnv, misspelledKeys, KNOWN_ENV_KEYS } from "@/app/lib/env";

const GOOD: Record<string, string | undefined> = {
  MONGO_URI: "mongodb+srv://u:p@cluster.example.net/db",
  JWT_SECRET: "a-very-long-secret-at-least-16",
  CRON_SECRET: "cron-secret-123",
};

/** A production environment that passes every production-only rule. */
const PROD: Record<string, string | undefined> = {
  ...GOOD,
  NODE_ENV: "production",
  CRON_SECRET: "cron-secret-that-is-at-least-32-characters-long",
  APP_URL: "https://job-match-six.vercel.app",
};

afterEach(() => vi.restoreAllMocks());

const errorsOf = (env: Record<string, string | undefined>) => checkEnv(env).errors.join("\n");
const warningsOf = (env: Record<string, string | undefined>) => checkEnv(env).warnings.join("\n");

describe("env contract", () => {
  it("accepts a minimal valid environment and warns about optional services", () => {
    const r = checkEnv(GOOD);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/OPENAI_API_KEY/);
  });

  it("accepts MONGODB_URI as an alias", () => {
    const { MONGO_URI, ...rest } = GOOD;
    expect(checkEnv({ ...rest, MONGODB_URI: MONGO_URI }).ok).toBe(true);
  });

  it("rejects a missing database URI, a short JWT secret and a bad URI scheme", () => {
    const { MONGO_URI, ...noDb } = GOOD;
    expect(checkEnv(noDb).errors.join(" ")).toMatch(/MONGO_URI/);
    expect(checkEnv({ ...GOOD, JWT_SECRET: "short" }).errors.join(" ")).toMatch(/JWT_SECRET/);
    expect(checkEnv({ ...GOOD, MONGO_URI: "postgres://x" }).errors.join(" ")).toMatch(/mongodb/);
  });

  it("warns (does not fail) when AWS credentials are only partly set", () => {
    const r = checkEnv({ ...GOOD, AWS_REGION: "eu-west-1" });
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/must be set together/);
    expect(checkEnv({ ...GOOD, AWS_REGION: "eu-west-1", AWS_ACCESS_KEY_ID: "k", AWS_SECRET_ACCESS_KEY: "s" }).ok).toBe(true);
  });

  it("throws in production but only logs elsewhere", () => {
    const { JWT_SECRET, ...bad } = PROD;
    expect(() => validateEnv(bad)).toThrow(/JWT_SECRET/);
    expect(() => validateEnv({ ...bad, NODE_ENV: "development" })).not.toThrow();
  });

  describe("production-only rules", () => {
    it("accepts a complete production environment", () => {
      expect(checkEnv(PROD).errors).toEqual([]);
    });

    it("requires an absolute https APP_URL in production only", () => {
      const { APP_URL, ...noUrl } = PROD;
      expect(errorsOf(noUrl)).toMatch(/APP_URL is required in production/);
      expect(errorsOf({ ...PROD, APP_URL: "http://job-match-six.vercel.app" })).toMatch(/APP_URL must be an absolute https/);
      expect(errorsOf({ ...PROD, APP_URL: "job-match-six.vercel.app" })).toMatch(/APP_URL/);
      // Development keeps working without it (siteUrl() falls back to localhost) and only warns.
      const dev = checkEnv(GOOD);
      expect(dev.ok).toBe(true);
      expect(dev.warnings.join(" ")).toMatch(/APP_URL missing/);
    });

    it("demands a 32+ character CRON_SECRET in production, 8+ elsewhere", () => {
      expect(errorsOf({ ...PROD, CRON_SECRET: "only-twenty-characters" })).toMatch(/CRON_SECRET must be at least 32/);
      expect(checkEnv({ ...GOOD, CRON_SECRET: "12345678" }).ok).toBe(true);
      expect(errorsOf({ ...GOOD, CRON_SECRET: "1234567" })).toMatch(/CRON_SECRET must be at least 8/);
    });

    it("PUPPETEER_SERVER_URL without SCRAPER_TOKEN in production is a warning (auto-apply self-disables), not a boot failure", () => {
      const withServer = { ...PROD, PUPPETEER_SERVER_URL: "https://apply.example.com" };
      const r = checkEnv(withServer);
      expect(r.ok).toBe(true);
      expect(r.warnings.join(" ")).toMatch(/without SCRAPER_TOKEN.*auto-apply is off/);
      expect(warningsOf({ ...withServer, SCRAPER_TOKEN: "token-12345" })).not.toMatch(/without SCRAPER_TOKEN/);
      expect(warningsOf({ ...GOOD, PUPPETEER_SERVER_URL: "http://localhost:4000" })).not.toMatch(/without SCRAPER_TOKEN/);
    });

    it("never throws for an optional-feature problem in production", () => {
      const env = { ...PROD, TELEGRAM_BOT_TOKEN: "123:abc", WHATSAPP_TOKEN: "EAAB", RESEND_API_KEY: "re_1", GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s", PUPPETEER_SERVER_URL: "https://apply.example.com" };
      vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(() => validateEnv(env)).not.toThrow();
    });
  });

  describe("Vercel preview deployments", () => {
    const { APP_URL, ...prodNoUrl } = PROD;

    it("fall back to https://VERCEL_BRANCH_URL, else https://VERCEL_URL, when APP_URL is unset", () => {
      const branch = checkEnv({ ...prodNoUrl, VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "jm-git-feat-x.vercel.app", VERCEL_URL: "jm-abc123.vercel.app" });
      expect(branch.ok).toBe(true);
      expect(branch.derivedAppUrl).toBe("https://jm-git-feat-x.vercel.app");
      const deploy = checkEnv({ ...prodNoUrl, VERCEL_ENV: "preview", VERCEL_URL: "jm-abc123.vercel.app" });
      expect(deploy.ok).toBe(true);
      expect(deploy.derivedAppUrl).toBe("https://jm-abc123.vercel.app");
    });

    it("an explicit APP_URL wins on previews", () => {
      const r = checkEnv({ ...PROD, VERCEL_ENV: "preview", VERCEL_URL: "jm-abc123.vercel.app" });
      expect(r.ok).toBe(true);
      expect(r.derivedAppUrl).toBeUndefined();
    });

    it("validateEnv writes the derived origin back so every consumer sees it", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const env: Record<string, string | undefined> = { ...prodNoUrl, VERCEL_ENV: "preview", VERCEL_URL: "jm-abc123.vercel.app" };
      expect(() => validateEnv(env)).not.toThrow();
      expect(env.APP_URL).toBe("https://jm-abc123.vercel.app");
    });

    it("Vercel production still requires APP_URL", () => {
      expect(errorsOf({ ...prodNoUrl, VERCEL_ENV: "production", VERCEL_URL: "jm-abc123.vercel.app" })).toMatch(/APP_URL is required in production/);
      expect(() => validateEnv({ ...prodNoUrl, VERCEL_ENV: "production", VERCEL_URL: "jm-abc123.vercel.app" })).toThrow(/APP_URL/);
    });
  });

  describe("paired requirements are warnings (the feature self-disables)", () => {
    it("TELEGRAM_BOT_TOKEN without TELEGRAM_WEBHOOK_SECRET", () => {
      const r = checkEnv({ ...GOOD, TELEGRAM_BOT_TOKEN: "123:abc" });
      expect(r.ok).toBe(true);
      expect(r.warnings.join(" ")).toMatch(/without TELEGRAM_WEBHOOK_SECRET/);
      expect(warningsOf({ ...GOOD, TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_WEBHOOK_SECRET: "hook-secret-1" })).not.toMatch(/TELEGRAM_WEBHOOK_SECRET/);
    });

    it("WHATSAPP_TOKEN without WHATSAPP_APP_SECRET", () => {
      const r = checkEnv({ ...GOOD, WHATSAPP_TOKEN: "EAAB" });
      expect(r.ok).toBe(true);
      expect(r.warnings.join(" ")).toMatch(/without WHATSAPP_APP_SECRET/);
      expect(warningsOf({ ...GOOD, WHATSAPP_TOKEN: "EAAB", WHATSAPP_APP_SECRET: "meta-app-secret" })).not.toMatch(/WHATSAPP_APP_SECRET/);
    });

    it("RESEND_API_KEY or SMTP_HOST without EMAIL_FROM", () => {
      expect(checkEnv({ ...GOOD, RESEND_API_KEY: "re_1" }).ok).toBe(true);
      expect(warningsOf({ ...GOOD, RESEND_API_KEY: "re_1" })).toMatch(/without EMAIL_FROM/);
      expect(warningsOf({ ...GOOD, SMTP_HOST: "smtp.gmail.com" })).toMatch(/without EMAIL_FROM/);
      expect(warningsOf({ ...GOOD, RESEND_API_KEY: "re_1", EMAIL_FROM: "JobMatch <no-reply@example.com>" })).not.toMatch(/EMAIL_FROM/);
    });

    it("GOOGLE_CLIENT_ID without TOKEN_ENCRYPTION_KEY (and a lone ID/secret)", () => {
      const google = { ...GOOD, GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "GOCSPX-x" };
      expect(checkEnv(google).ok).toBe(true);
      expect(warningsOf(google)).toMatch(/without TOKEN_ENCRYPTION_KEY/);
      expect(warningsOf({ ...google, TOKEN_ENCRYPTION_KEY: "sixteen-char-key!" })).not.toMatch(/TOKEN_ENCRYPTION_KEY/);
      expect(warningsOf({ ...GOOD, FACEBOOK_APP_ID: "123" })).toMatch(/FACEBOOK_APP_ID and FACEBOOK_APP_SECRET must be set together/);
    });
  });

  describe("tolerant parsing", () => {
    it("treats empty-string values as unset", () => {
      const r = checkEnv({ ...PROD, PUPPETEER_SERVER_URL: "", SCRAPER_TOKEN: "", SMTP_PORT: " ", TELEGRAM_BOT_TOKEN: "" });
      expect(r.ok).toBe(true);
      expect(r.invalidKeys).toEqual([]);
      expect(r.warnings.join(" ")).toMatch(/PUPPETEER_SERVER_URL missing/);
    });

    it("accepts true/false alongside 1/0 for FEATURE_* flags", () => {
      for (const v of ["0", "1", "true", "false"]) {
        expect(checkEnv({ ...PROD, FEATURE_AUTO_APPLY: v, FEATURE_PHONE: v, FEATURE_MCP: v }).invalidKeys).toEqual([]);
      }
    });

    it("a malformed optional value is a warning, and validateEnv drops it", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const env: Record<string, string | undefined> = { ...PROD, PUPPETEER_SERVER_URL: "not a url", FEATURE_PHONE: "yes" };
      const r = validateEnv(env);
      expect(r.ok).toBe(true);
      expect(r.invalidKeys.sort()).toEqual(["FEATURE_PHONE", "PUPPETEER_SERVER_URL"]);
      expect(env.PUPPETEER_SERVER_URL).toBeUndefined();
      expect(env.FEATURE_PHONE).toBeUndefined();
    });

    it("a malformed core value is still fatal in production", () => {
      expect(() => validateEnv({ ...PROD, MONGO_URI: "postgres://x" })).toThrow(/MONGO_URI/);
      expect(() => validateEnv({ ...PROD, JWT_SECRET: "" })).toThrow(/JWT_SECRET/);
    });
  });

  describe("key hygiene", () => {
    it("knows every key the code reads", () => {
      for (const k of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM", "PHONE_BRIDGE_WSS_URL", "NEXT_PUBLIC_CSV_URL", "WORKER_BUDGET_MS", "WORKER_IDLE_MS", "QUOTA_VOICE_SESSION", "PRACTICE_MODEL", "OPENAI_REALTIME_MODEL", "WHATSAPP_APP_SECRET", "SERPAPI_KEY", "ATLAS_FILTER_ACTIVE", "VERCEL_ENV", "VERCEL_URL", "VERCEL_BRANCH_URL"]) {
        expect(KNOWN_ENV_KEYS, k).toContain(k);
      }
    });

    it("warns about near-miss key names like SERPAPI-KEY", () => {
      expect(misspelledKeys({ "SERPAPI-KEY": "x", cron_secret: "y", UNRELATED_THING: "z", SERPAPI_KEY: "ok" })).toEqual([
        ["SERPAPI-KEY", "SERPAPI_KEY"],
        ["cron_secret", "CRON_SECRET"],
      ]);
      const r = checkEnv({ ...GOOD, "SERPAPI-KEY": "x" });
      expect(r.ok).toBe(true);
      expect(r.warnings.join(" ")).toMatch(/SERPAPI-KEY looks like a misspelling of SERPAPI_KEY/);
    });
  });
});
