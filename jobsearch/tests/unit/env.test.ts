import { describe, it, expect } from "vitest";
import { checkEnv, validateEnv } from "@/app/lib/env";

const GOOD: Record<string, string | undefined> = {
  MONGO_URI: "mongodb+srv://u:p@cluster.example.net/db",
  JWT_SECRET: "a-very-long-secret-at-least-16",
  CRON_SECRET: "cron-secret-123",
};

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
    const { JWT_SECRET, ...bad } = GOOD;
    expect(() => validateEnv({ ...bad, NODE_ENV: "production" })).toThrow(/JWT_SECRET/);
    expect(() => validateEnv({ ...bad, NODE_ENV: "development" })).not.toThrow();
  });
});
