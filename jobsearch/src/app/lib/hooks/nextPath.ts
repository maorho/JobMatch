/**
 * Post-login destinations. Only same-origin relative paths are allowed, so a
 * crafted `?next=https://evil` (or protocol-relative `//evil`) never redirects
 * the user off-site. Mirrors `safeNext` in lib/oauth/providers (server side).
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /^\/[\s]/.test(next)) return fallback;
  // Never bounce back into the auth pages themselves.
  if (/^\/(Login|SignUp|PasswordReset)(\/|\?|$)/.test(next)) return fallback;
  return next;
}

/** `/Login?next=<path>` for the page the user is on (or a given path). */
export function loginHref(path?: string | null): string {
  const p = path ?? (typeof window !== "undefined" ? window.location.pathname + window.location.search : "");
  const safe = safeNextPath(p, "");
  return safe && safe !== "/" ? `/Login?next=${encodeURIComponent(safe)}` : "/Login";
}
