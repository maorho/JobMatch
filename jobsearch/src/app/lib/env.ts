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

const flag = z.enum(["0", "1"]).optional();
const digits = z.string().regex(/^\d+$/).optional();

/** Base object: every key the app reads. Conditional requirements live in `envSchema` below. */
export const envShape = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    MONGO_URI: mongoUrl.optional(),
    MONGODB_URI: mongoUrl.optional(),
    JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
    // 8 is enough for local dev; production demands 32 (see the refinement below).
    CRON_SECRET: z.string().min(8, "CRON_SECRET must be at least 8 characters"),
    // Public origin (https://...). Required in production: OAuth redirect URIs, canonical URLs,
    // sitemap, emails and the Telegram/WhatsApp webhooks are all built from it.
    APP_URL: z.string().url().optional(),
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    // Matcher (embeddings). Optional: without it the feed falls back to recency.
    OPENAI_API_KEY: z.string().min(1).optional(),
    // Model-name overrides (defaults live next to each caller).
    OPENAI_REALTIME_MODEL: z.string().min(1).optional(),
    OPENAI_REALTIME_VOICE: z.string().min(1).optional(),
    PRACTICE_MODEL: z.string().min(1).optional(),
    WEB_QUESTIONS_MODEL: z.string().min(1).optional(),
    COMPANY_RESEARCH_MODEL: z.string().min(1).optional(),
    COMPANY_PROFILE_MODEL: z.string().min(1).optional(),
    APPLY_AGENT_MODEL: z.string().min(1).optional(),
    // Atlas Search / vector index usage ("0" forces the in-process fallback).
    ATLAS_SEARCH: flag,
    // Agent bus: "0" stops ticks from running inline after a trigger.
    AGENTS_INLINE: flag,
    // Puppeteer render/capture server (ATS detection, captures, auto-apply). Optional.
    PUPPETEER_SERVER_URL: z.string().url().optional(),
    SCRAPER_TOKEN: z.string().min(8).optional(),
    SCRAPER_ALLOWED_ORIGIN: z.string().url().optional(),
    SCRAPER_CONCURRENCY: digits,
    // Background worker (server/worker.ts) budget per run / idle poll, in ms.
    WORKER_BUDGET_MS: digits,
    WORKER_IDLE_MS: digits,
    // Per-user daily caps on paid actions override DEFAULT_LIMITS in lib/ops/quota.ts, e.g. QUOTA_VOICE_SESSION=10.
    QUOTA_VOICE_SESSION: digits,
    QUOTA_PHONE_SESSION: digits,
    QUOTA_AUTO_APPLY: digits,
    QUOTA_TAILOR: digits,
    QUOTA_PRACTICE_GRADE: digits,
    QUOTA_ENFORCE_IN_TESTS: flag,
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
    // Gmail application tracking: refresh tokens are sealed with this key (required with GOOGLE_CLIENT_ID).
    TOKEN_ENCRYPTION_KEY: z.string().min(16).optional(),
    // Outbound email (password reset, contact relay). One of: RESEND_API_KEY, or SMTP_HOST + SMTP_USER + SMTP_PASS
    // (Gmail: smtp.gmail.com, port 465, an App Password). Without either, dev mode shows the reset link on screen.
    RESEND_API_KEY: z.string().optional(),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: digits,
    SMTP_SECURE: z.enum(["0", "1", "true", "false"]).optional(),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASS: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(3).optional(),
    CONTACT_FROM_EMAIL: z.string().min(3).optional(),
    CONTACT_TO_EMAIL: z.string().email().optional(),
    ALERT_EMAIL: z.string().email().optional(),
    // Messaging channels (optional): WhatsApp Cloud API and/or a Telegram bot.
    WHATSAPP_TOKEN: z.string().min(1).optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
    WHATSAPP_DISPLAY_NUMBER: z.string().min(5).optional(),
    WHATSAPP_VERIFY_TOKEN: z.string().min(8).optional(),
    // Meta app secret: webhook payloads are HMAC-verified against it (required with WHATSAPP_TOKEN).
    WHATSAPP_APP_SECRET: z.string().min(8).optional(),
    TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
    TELEGRAM_BOT_USERNAME: z.string().min(1).optional(),
    // Telegram sends it back as X-Telegram-Bot-Api-Secret-Token (required with TELEGRAM_BOT_TOKEN).
    TELEGRAM_WEBHOOK_SECRET: z.string().min(8).optional(),
    // Phone interviews over Twilio + the voice bridge (FEATURE_PHONE=1 to enable).
    TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
    TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
    TWILIO_FROM: z.string().min(5).optional(),
    PHONE_BRIDGE_WSS_URL: z.string().regex(/^wss?:\/\//, "must be a wss:// URL").optional(),
    // Legacy Google-Sheet CSV of external jobs (external-jobs/sync-if-stale). Optional.
    NEXT_PUBLIC_CSV_URL: z.string().url().optional(),
    // Feature flags (lib/flags.ts): "1" turns on, "0" turns off. Phone interviews stay off until tested live;
    // auto-apply defaults to "on only when PUPPETEER_SERVER_URL is set".
    FEATURE_PHONE: flag,
    FEATURE_AUTO_APPLY: flag,
    FEATURE_MCP: flag,
    NEXT_PUBLIC_FEATURE_PHONE: flag,
    NEXT_PUBLIC_FEATURE_AUTO_APPLY: flag,
    NEXT_PUBLIC_FEATURE_MCP: flag,
});

/** Every key the schema knows, for the misspelling check in checkEnv. */
export const KNOWN_ENV_KEYS: readonly string[] = Object.keys(envShape.shape);

/** Which variables matter in production only (checked by the refinement; listed here for .env.example/docs). */
export const PRODUCTION_REQUIRED = ["APP_URL", "MONGO_URI", "JWT_SECRET", "CRON_SECRET"] as const;

export const envSchema = envShape
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
  )
  .superRefine((e, ctx) => {
    const prod = e.NODE_ENV === "production";
    const fail = (key: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message });

    // --- production-only hardening ---
    if (prod) {
      if (!e.APP_URL) fail("APP_URL", "APP_URL is required in production (the public https origin, e.g. https://job-match-six.vercel.app)");
      else if (!/^https:\/\//.test(e.APP_URL)) fail("APP_URL", "APP_URL must be an absolute https:// URL in production");
      if (e.CRON_SECRET.length < 32) fail("CRON_SECRET", "CRON_SECRET must be at least 32 characters in production (openssl rand -hex 32)");
      if (e.PUPPETEER_SERVER_URL && !e.SCRAPER_TOKEN) fail("SCRAPER_TOKEN", "SCRAPER_TOKEN is required in production when PUPPETEER_SERVER_URL is set");
    }

    // --- "if you turn X on, you also need Y" ---
    if (e.TELEGRAM_BOT_TOKEN && !e.TELEGRAM_WEBHOOK_SECRET) fail("TELEGRAM_WEBHOOK_SECRET", "TELEGRAM_WEBHOOK_SECRET is required when TELEGRAM_BOT_TOKEN is set (the webhook rejects unsigned updates)");
    if (e.WHATSAPP_TOKEN && !e.WHATSAPP_APP_SECRET) fail("WHATSAPP_APP_SECRET", "WHATSAPP_APP_SECRET is required when WHATSAPP_TOKEN is set (webhook signature check)");
    if ((e.RESEND_API_KEY || e.SMTP_HOST) && !e.EMAIL_FROM) fail("EMAIL_FROM", "EMAIL_FROM is required when RESEND_API_KEY or SMTP_HOST is set");
    if (e.GOOGLE_CLIENT_ID && !e.TOKEN_ENCRYPTION_KEY) fail("TOKEN_ENCRYPTION_KEY", "TOKEN_ENCRYPTION_KEY is required when GOOGLE_CLIENT_ID is set (Gmail refresh tokens are sealed with it)");
  });

export type Env = z.infer<typeof envSchema>;

export type EnvReport = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

/** Any string map — process.env in practice, a literal in tests. */
export type EnvSource = Record<string, string | undefined>;

const normalizeKey = (k: string) => k.toUpperCase().replace(/[-\s.]+/g, "_");

/**
 * Keys in `source` that are not in the schema but become a known key once
 * hyphens/case are normalised — `SERPAPI-KEY` for `SERPAPI_KEY`, `cron_secret`
 * for `CRON_SECRET`. Returned as [actual, intended] pairs.
 */
export function misspelledKeys(source: EnvSource): Array<[string, string]> {
  const known = new Set(KNOWN_ENV_KEYS);
  const out: Array<[string, string]> = [];
  for (const k of Object.keys(source)) {
    if (known.has(k)) continue;
    const n = normalizeKey(k);
    if (n !== k && known.has(n)) out.push([k, n]);
  }
  return out;
}

/** Validate a given environment (defaults to process.env). Pure: no throwing. */
export function checkEnv(source: EnvSource = process.env): EnvReport {
  const parsed = envSchema.safeParse(source);
  const errors = parsed.success
    ? []
    : parsed.error.issues.map((i) => `${i.path.join(".") || "env"}: ${i.message}`);
  const warnings: string[] = [];
  for (const [actual, intended] of misspelledKeys(source)) warnings.push(`${actual} looks like a misspelling of ${intended} (the app reads ${intended}; rename it)`);
  if (!source.OPENAI_API_KEY) warnings.push("OPENAI_API_KEY missing: résumé matching is disabled (feed falls back to recency)");
  if (!source.PUPPETEER_SERVER_URL) warnings.push("PUPPETEER_SERVER_URL missing: ATS auto-detection/capture and auto-apply will be skipped");
  if (!source.APP_URL && source.NODE_ENV !== "production") warnings.push("APP_URL missing: links fall back to http://localhost:3000 (required in production)");
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
