import { z } from "zod";
import { vercelPreviewOrigin } from "./appUrl";

/**
 * Environment contract, validated once at server start (see
 * src/instrumentation.ts and server/worker.ts).
 *
 * Only the core contract is fatal (HARD_KEYS: database, JWT/cron secrets and,
 * in production, the public APP_URL) — a bad deploy of those fails at boot
 * instead of hours later inside a cron run. Everything else configures an
 * optional feature: a missing partner variable or a malformed value is a loud
 * WARNING, the bad value is dropped, and the feature switches itself off at
 * runtime (gmail connect → 503, webhooks → 503, auto-apply off, …) instead of
 * taking the whole site down.
 */
const mongoUrl = z
  .string()
  .regex(/^mongodb(\+srv)?:\/\//, "must be a mongodb:// or mongodb+srv:// URI");

const flag = z.enum(["0", "1"]).optional();
/** FEATURE_* switches also accept the spelled-out form people tend to type in dashboards. */
const featureFlag = z.enum(["0", "1", "true", "false"]).optional();
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
    // On a Vercel Preview deployment it may be left unset: the deployment's own
    // origin (https://$VERCEL_BRANCH_URL, else https://$VERCEL_URL) is used instead.
    APP_URL: z.string().url().optional(),
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    // Injected by Vercel (hostnames without a protocol). Read for the preview APP_URL fallback.
    VERCEL_ENV: z.string().optional(),
    VERCEL_URL: z.string().optional(),
    VERCEL_BRANCH_URL: z.string().optional(),
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
    // "1" pushes the active-jobs filter into the Atlas $vectorSearch / $search stage (matcher/atlas.ts).
    // Set it only AFTER adding `active` as a filter field to both the job_vectors and job_text indexes.
    ATLAS_FILTER_ACTIVE: flag,
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
    // Gmail application tracking: refresh tokens are sealed with this key (without it Gmail tracking stays off).
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
    // Meta app secret: webhook payloads are HMAC-verified against it (without it the webhook returns 503).
    WHATSAPP_APP_SECRET: z.string().min(8).optional(),
    TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
    TELEGRAM_BOT_USERNAME: z.string().min(1).optional(),
    // Telegram sends it back as X-Telegram-Bot-Api-Secret-Token (without it the webhook returns 503).
    TELEGRAM_WEBHOOK_SECRET: z.string().min(8).optional(),
    // Phone interviews over Twilio + the voice bridge (FEATURE_PHONE=1 to enable).
    TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
    TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
    TWILIO_FROM: z.string().min(5).optional(),
    PHONE_BRIDGE_WSS_URL: z.string().regex(/^wss?:\/\//, "must be a wss:// URL").optional(),
    // Legacy Google-Sheet CSV of external jobs (external-jobs/sync-if-stale). Optional.
    NEXT_PUBLIC_CSV_URL: z.string().url().optional(),
    // Feature flags (lib/flags.ts): "1"/"true" turns on, "0"/"false" turns off. Phone interviews stay off until
    // tested live; auto-apply defaults to "on only when the apply server is configured" (see flags.ts).
    FEATURE_PHONE: featureFlag,
    FEATURE_AUTO_APPLY: featureFlag,
    FEATURE_MCP: featureFlag,
});

/** Every key the schema knows, for the misspelling check in checkEnv. */
export const KNOWN_ENV_KEYS: readonly string[] = Object.keys(envShape.shape);

/** Which variables matter in production only (listed here for .env.example/docs). */
export const PRODUCTION_REQUIRED = ["APP_URL", "MONGO_URI", "JWT_SECRET", "CRON_SECRET"] as const;

/** The only keys whose absence/malformation is fatal. Everything else is a warning. */
export const HARD_KEYS: ReadonlySet<string> = new Set(["NODE_ENV", "MONGO_URI", "MONGODB_URI", "JWT_SECRET", "CRON_SECRET", "APP_URL"]);

export type Env = z.infer<typeof envShape>;

export type EnvReport = {
  ok: boolean;
  /** Fatal: the app refuses to boot in production. */
  errors: string[];
  /** Loud but non-fatal: an optional feature is misconfigured and stays off. */
  warnings: string[];
  /** Optional keys whose value failed validation — validateEnv drops them so the feature self-disables. */
  invalidKeys: string[];
  /** APP_URL derived from the Vercel preview hostname when APP_URL itself is unset. */
  derivedAppUrl?: string;
};

/** Any string map — process.env in practice, a literal in tests. */
export type EnvSource = Record<string, string | undefined>;

/** Blank values ("" or whitespace, e.g. `PUPPETEER_SERVER_URL=`) count as unset. */
export function normalizeEnv(source: EnvSource): EnvSource {
  const out: EnvSource = {};
  for (const [k, v] of Object.entries(source)) out[k] = typeof v === "string" && v.trim() === "" ? undefined : v;
  return out;
}

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
  const env = normalizeEnv(source);
  const prod = env.NODE_ENV === "production";
  // Vercel Preview builds run with NODE_ENV=production but rarely have their own APP_URL.
  const derivedAppUrl = env.APP_URL ? undefined : vercelPreviewOrigin(env);
  const effective: EnvSource = derivedAppUrl ? { ...env, APP_URL: derivedAppUrl } : env;

  const errors: string[] = [];
  const warnings: string[] = [];
  const invalid = new Set<string>();
  const fail = (msg: string) => errors.push(msg);
  const warn = (msg: string) => warnings.push(msg);

  // 1. Shape: malformed core keys are fatal; a malformed optional value is ignored with a warning.
  const parsed = envShape.safeParse(effective);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "env");
      const line = `${issue.path.join(".") || "env"}: ${issue.message}`;
      if (HARD_KEYS.has(key)) fail(line);
      else {
        invalid.add(key);
        warn(`${line} — value ignored, the feature it configures stays off`);
      }
    }
  }

  // 2. Core contract.
  if (!effective.MONGO_URI && !effective.MONGODB_URI) fail("MONGO_URI: MONGO_URI (or MONGODB_URI) is required");
  if (prod) {
    if (!effective.APP_URL) fail("APP_URL: APP_URL is required in production (the public https origin, e.g. https://job-match-six.vercel.app; Vercel previews fall back to VERCEL_BRANCH_URL/VERCEL_URL)");
    else if (!/^https:\/\//.test(effective.APP_URL)) fail("APP_URL: APP_URL must be an absolute https:// URL in production");
    if (effective.CRON_SECRET && effective.CRON_SECRET.length < 32) fail("CRON_SECRET: CRON_SECRET must be at least 32 characters in production (openssl rand -hex 32)");
  }
  if (derivedAppUrl) warn(`APP_URL unset on a Vercel preview: using ${derivedAppUrl}`);

  // 3. Optional features: "if you turn X on, you also need Y" — the feature self-disables without Y.
  if (env.TELEGRAM_BOT_TOKEN && !env.TELEGRAM_WEBHOOK_SECRET) warn("TELEGRAM_BOT_TOKEN is set without TELEGRAM_WEBHOOK_SECRET: the Telegram webhook refuses every update (503) until it is set");
  if (env.WHATSAPP_TOKEN && !env.WHATSAPP_APP_SECRET) warn("WHATSAPP_TOKEN is set without WHATSAPP_APP_SECRET: the WhatsApp webhook refuses every delivery (503) until it is set");
  if ((env.RESEND_API_KEY || env.SMTP_HOST) && !env.EMAIL_FROM) warn("RESEND_API_KEY/SMTP_HOST is set without EMAIL_FROM: mail goes out from a fallback sender (Resend's sandbox sender only reaches the account owner)");
  if (env.GOOGLE_CLIENT_ID && !env.TOKEN_ENCRYPTION_KEY) warn("GOOGLE_CLIENT_ID is set without TOKEN_ENCRYPTION_KEY: Gmail application tracking is disabled (connect returns 503); Google sign-in still works");
  if (!!env.GOOGLE_CLIENT_ID !== !!env.GOOGLE_CLIENT_SECRET) warn("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together: Google sign-in is disabled");
  if (!!env.FACEBOOK_APP_ID !== !!env.FACEBOOK_APP_SECRET) warn("FACEBOOK_APP_ID and FACEBOOK_APP_SECRET must be set together: Facebook sign-in is disabled");
  const aws = [env.AWS_REGION, env.AWS_ACCESS_KEY_ID, env.AWS_SECRET_ACCESS_KEY].filter(Boolean).length;
  if (aws > 0 && aws < 3) warn("AWS_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set together: résumé file uploads will fail");
  if (prod && env.PUPPETEER_SERVER_URL && !env.SCRAPER_TOKEN) warn("PUPPETEER_SERVER_URL is set without SCRAPER_TOKEN: the apply server is treated as not configured in production (auto-apply is off)");

  // 4. Hygiene + optional services.
  for (const [actual, intended] of misspelledKeys(source)) warn(`${actual} looks like a misspelling of ${intended} (the app reads ${intended}; rename it)`);
  if (!env.OPENAI_API_KEY) warn("OPENAI_API_KEY missing: résumé matching is disabled (feed falls back to recency)");
  if (!env.PUPPETEER_SERVER_URL) warn("PUPPETEER_SERVER_URL missing: ATS auto-detection/capture and auto-apply will be skipped");
  if (!effective.APP_URL && !prod) warn("APP_URL missing: links fall back to http://localhost:3000 (required in production)");

  return { ok: errors.length === 0, errors, warnings, invalidKeys: [...invalid], ...(derivedAppUrl ? { derivedAppUrl } : {}) };
}

/**
 * Validate at boot. Throws in production only for the core contract (HARD_KEYS)
 * so a misconfigured deploy never serves traffic; optional-feature problems are
 * logged loudly and the offending value is dropped from `source` so the feature
 * reads as unconfigured. On a Vercel preview without APP_URL, the derived origin
 * is written back to `source.APP_URL` so every consumer agrees on it.
 */
export function validateEnv(source: EnvSource = process.env): EnvReport {
  const report = checkEnv(source);
  if (report.derivedAppUrl && !source.APP_URL?.trim()) source.APP_URL = report.derivedAppUrl;
  for (const k of report.invalidKeys) delete source[k];
  for (const w of report.warnings) console.warn(`⚠️  env: ${w}`);
  if (!report.ok) {
    const msg = `Invalid environment:\n  - ${report.errors.join("\n  - ")}`;
    if (source.NODE_ENV === "production") throw new Error(msg);
    console.error(`❌ ${msg}`);
  }
  return report;
}
