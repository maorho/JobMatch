/**
 * Dependency-free helpers for the public origin, shared by lib/env.ts (boot
 * validation) and lib/seo/site.ts (siteUrl). Kept tiny so importing it never
 * pulls zod into a page bundle.
 */
type EnvLike = Record<string, string | undefined>;

const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

/**
 * On a Vercel Preview deployment, the deployment's own origin:
 * https://$VERCEL_BRANCH_URL (stable per branch), else https://$VERCEL_URL.
 * Vercel injects both as bare hostnames. Undefined anywhere else — Production
 * (VERCEL_ENV=production) must set APP_URL explicitly.
 */
export function vercelPreviewOrigin(env: EnvLike = process.env): string | undefined {
  if (env.VERCEL_ENV !== "preview") return undefined;
  const host = clean(env.VERCEL_BRANCH_URL) || clean(env.VERCEL_URL);
  if (!host) return undefined;
  return `https://${host.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
}
