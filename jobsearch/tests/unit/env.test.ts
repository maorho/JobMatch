import { describe, it, expect } from "vitest";
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

const errorsOf = (env: Record<string, string | undefined>) => checkEnv(env).errors.join("\n");

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

  it("requires AWS credentials to be set together", () => {
    const r = checkEnv({ ...GOOD, AWS_REGION: "eu-west-1" });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/together/);
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

    it("requires SCRAPER_TOKEN with PUPPETEER_SERVER_URL in production only", () => {
      const withServer = { ...PROD, PUPPETEER_SERVER_URL: "https://apply.example.com" };
      expect(errorsOf(withServer)).toMatch(/SCRAPER_TOKEN is required in production/);
      expect(checkEnv({ ...withServer, SCRAPER_TOKEN: "token-12345" }).ok).toBe(true);
      expect(checkEnv({ ...GOOD, PUPPETEER_SERVER_URL: "http://localhost:4000" }).ok).toBe(true);
    });
  });

  describe("paired requirements", () => {
    it("TELEGRAM_BOT_TOKEN needs TELEGRAM_WEBHOOK_SECRET", () => {
      expect(errorsOf({ ...GOOD, TELEGRAM_BOT_TOKEN: "123:abc" })).toMatch(/TELEGRAM_WEBHOOK_SECRET is required/);
      expect(checkEnv({ ...GOOD, TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_WEBHOOK_SECRET: "hook-secret-1" }).ok).toBe(true);
    });

    it("WHATSAPP_TOKEN needs WHATSAPP_APP_SECRET", () => {
      expect(errorsOf({ ...GOOD, WHATSAPP_TOKEN: "EAAB" })).toMatch(/WHATSAPP_APP_SECRET is required/);
      expect(checkEnv({ ...GOOD, WHATSAPP_TOKEN: "EAAB", WHATSAPP_APP_SECRET: "meta-app-secret" }).ok).toBe(true);
    });

    it("RESEND_API_KEY or SMTP_HOST needs EMAIL_FROM", () => {
      expect(errorsOf({ ...GOOD, RESEND_API_KEY: "re_1" })).toMatch(/EMAIL_FROM is required/);
      expect(errorsOf({ ...GOOD, SMTP_HOST: "smtp.gmail.com" })).toMatch(/EMAIL_FROM is required/);
      expect(checkEnv({ ...GOOD, RESEND_API_KEY: "re_1", EMAIL_FROM: "JobMatch <no-reply@example.com>" }).ok).toBe(true);
    });

    it("GOOGLE_CLIENT_ID needs TOKEN_ENCRYPTION_KEY (and its secret)", () => {
      const google = { ...GOOD, GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "GOCSPX-x" };
      expect(errorsOf(google)).toMatch(/TOKEN_ENCRYPTION_KEY is required/);
      expect(checkEnv({ ...google, TOKEN_ENCRYPTION_KEY: "sixteen-char-key!" }).ok).toBe(true);
    });
  });

  describe("key hygiene", () => {
    it("knows every key the code reads", () => {
      for (const k of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM", "PHONE_BRIDGE_WSS_URL", "NEXT_PUBLIC_CSV_URL", "WORKER_BUDGET_MS", "WORKER_IDLE_MS", "QUOTA_VOICE_SESSION", "PRACTICE_MODEL", "OPENAI_REALTIME_MODEL", "WHATSAPP_APP_SECRET", "SERPAPI_KEY"]) {
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
