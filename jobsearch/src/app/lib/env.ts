import { z } from "zod";

/**
 * Environment contract, validated once at server start (see
 * src/instrumentation.ts). A missing or malformed variable fails fast in
 * production instead of surfacing hours later as a 500 inside a cron run —
 * e.g. the SerpApi key once lived under a hyphenated name nobody noticed.
 */
const mongoUrl = z
  .string()
  .regex(/^mongodb(\+srv)?:\/\//, "must be a mongodb:// or mongodb+srv:// URI");

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    MONGO_URI: mongoUrl.optional(),
    MONGODB_URI: mongoUrl.optional(),
    JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
    CRON_SECRET: z.string().min(8, "CRON_SECRET must be at least 8 characters"),
    // Matcher (embeddings). Optional: without it the feed falls back to recency.
    OPENAI_API_KEY: z.string().min(1).optional(),
    // Puppeteer render/capture server (ATS detection, captures). Optional.
    PUPPETEER_SERVER_URL: z.string().url().optional(),
    SCRAPER_TOKEN: z.string().min(8).optional(),
    // Résumé file storage. All-or-nothing.
    AWS_REGION: z.string().min(1).optional(),
    AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
    AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    S3_BUCKET_NAME: z.string().min(1).optional(),
    SERPAPI_KEY: z.string().optional(),
    // Social login. Each provider needs both of its values to be enabled.
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    FACEBOOK_APP_ID: z.string().min(1).optional(),
    FACEBOOK_APP_SECRET: z.string().min(1).optional(),
    APP_URL: z.string().url().optional(),
    // Gmail application tracking: refresh tokens are sealed with this key.
    TOKEN_ENCRYPTION_KEY: z.string().min(16).optional(),
    // Contact form relay (optional).
    RESEND_API_KEY: z.string().optional(),
    CONTACT_TO_EMAIL: z.string().email().optional(),
  })
  .refine((e) => !!e.GOOGLE_CLIENT_ID === !!e.GOOGLE_CLIENT_SECRET, {
    message: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together",
    path: ["GOOGLE_CLIENT_ID"],
  })
  .refine((e) => !!e.FACEBOOK_APP_ID === !!e.FACEBOOK_APP_SECRET, {
    message: "FACEBOOK_APP_ID and FACEBOOK_APP_SECRET must be set together",
    path: ["FACEBOOK_APP_ID"],
  })
  .refine((e) => e.MONGO_URI || e.MONGODB_URI, {
    message: "MONGO_URI (or MONGODB_URI) is required",
    path: ["MONGO_URI"],
  })
  .refine(
    (e) => {
      const aws = [e.AWS_REGION, e.AWS_ACCESS_KEY_ID, e.AWS_SECRET_ACCESS_KEY];
      const set = aws.filter(Boolean).length;
      return set === 0 || set === aws.length;
    },
    { message: "AWS_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set together", path: ["AWS_REGION"] }
  );

export type Env = z.infer<typeof envSchema>;

export type EnvReport = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

/** Any string map — process.env in practice, a literal in tests. */
export type EnvSource = Record<string, string | undefined>;

/** Validate a given environment (defaults to process.env). Pure: no throwing. */
export function checkEnv(source: EnvSource = process.env): EnvReport {
  const parsed = envSchema.safeParse(source);
  const errors = parsed.success
    ? []
    : parsed.error.issues.map((i) => `${i.path.join(".") || "env"}: ${i.message}`);
  const warnings: string[] = [];
  if (!source.OPENAI_API_KEY) warnings.push("OPENAI_API_KEY missing: résumé matching is disabled (feed falls back to recency)");
  if (!source.PUPPETEER_SERVER_URL) warnings.push("PUPPETEER_SERVER_URL missing: ATS auto-detection/capture will be skipped");
  return { ok: parsed.success, errors, warnings };
}

/**
 * Validate at boot. Throws in production so a misconfigured deploy never
 * serves traffic; logs loudly elsewhere so local dev keeps working.
 */
export function validateEnv(source: EnvSource = process.env): EnvReport {
  const report = checkEnv(source);
  for (const w of report.warnings) console.warn(`⚠️  env: ${w}`);
  if (!report.ok) {
    const msg = `Invalid environment:\n  - ${report.errors.join("\n  - ")}`;
    if (source.NODE_ENV === "production") throw new Error(msg);
    console.error(`❌ ${msg}`);
  }
  return report;
}
