/**
 * Next.js instrumentation hook — runs once when the server process starts.
 * Validates the environment contract so a bad deploy fails at boot, not on
 * the first cron tick (core keys only — optional-feature problems are logged
 * as warnings and the feature self-disables). It also fills APP_URL from the
 * Vercel preview hostname when unset. Only the Node runtime has process.env
 * and our deps.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./app/lib/env");
    validateEnv();
  }
}
