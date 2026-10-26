/**
 * Company logo helpers. We store the company domain on each job and resolve a
 * logo from it. The UI falls back gracefully (primary → favicon → letter
 * placeholder) so a job card never shows a broken image.
 *
 * Provider notes (verified 2026-10-07): Clearbit's logo API is dead and
 * unavatar.io now rate-limits every request (HTTP 429), so both are unusable.
 * DuckDuckGo's icon service returns real logos (image/png) and is the primary;
 * Google's favicon service is the secondary fallback.
 */

/** Normalize anything domain-ish ("https://careers.Monday.com/jobs") to "monday.com". */
export function normalizeDomain(input: string): string {
  if (!input) return "";
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "");
  d = d.split("/")[0].split("?")[0];
  // Drop common career-portal subdomains so the logo lookup hits the root
  // domain (jobs.intel.com -> intel.com), which is what the icon services index.
  d = d.replace(/^(www|careers|career|jobs|job|boards|apply|work|hire|talent)\./, "");
  return d;
}

/**
 * ATS / job-board hosts that are NOT a company's own domain. A job whose stored
 * domain is one of these (e.g. every Comeet company gets "comeet.com") would
 * otherwise share one logo, so we guess from the company name instead.
 */
const ATS_HOST_ROOTS = [
  "comeet.com",
  "comeet.co",
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "myworkdayjobs.com",
  "smartrecruiters.com",
  "recruitee.com",
  "workable.com",
  "amazon.jobs",
  "jobs.local",
];

export function isAtsHost(domain: string): boolean {
  const d = normalizeDomain(domain);
  return !!d && ATS_HOST_ROOTS.some((root) => d === root || d.endsWith(`.${root}`));
}

/**
 * The domain to resolve a company's logo from: the stored domain when it is the
 * company's own, otherwise a best-effort guess from the name. Guarantees each
 * company resolves to its own domain rather than a shared ATS host.
 */
export function resolveLogoDomain(domain: string | undefined, name: string): string {
  const d = normalizeDomain(domain || "");
  if (d && !isAtsHost(d)) return d;
  return guessDomainFromName(name);
}

/**
 * Best-effort domain from a company name when we have no explicit one, e.g.
 * "Google" -> "google.com". Good for single-word, well-known companies; the
 * UI's logo fallback chain covers the cases where the guess misses.
 */
export function guessDomainFromName(name: string): string {
  if (!name) return "";
  const cleaned = name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co|gmbh|group|technologies|technology|labs|software|the)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
  return cleaned ? `${cleaned}.com` : "";
}

/** Primary logo (DuckDuckGo returns real logos). Empty when no domain. */
export function getLogoUrl(domain: string): string {
  const d = normalizeDomain(domain);
  return d ? `https://icons.duckduckgo.com/ip3/${encodeURIComponent(d)}.ico` : "";
}

/** Secondary favicon fallback (Google) for the UI's onError handler. */
export function getFaviconUrl(domain: string): string {
  const d = normalizeDomain(domain);
  return d
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=128`
    : "";
}
