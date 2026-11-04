import { Adapter, NormalizedPosting, adapterResult, fetchJson, fetchText, htmlToText } from "../types";

/**
 * Check Point careers (careers.checkpoint.com, verified 2026-11-04).
 * A Next.js site: /jobs?country=Israel is server-rendered with the first page
 * of results inside `__NEXT_DATA__` (pageProps.result: numberOfMatches,
 * numberOfPages, jobPostingsList[10]); further pages come as JSON from
 * `/_next/data/{buildId}/jobs.json?country=Israel&page=N` (1-based). The
 * buildId changes on every deploy of theirs, so it is read from the HTML
 * each run. A posting carries id, title, department, city, country, seniority,
 * and three HTML blocks (responsibility, description, information).
 *   identifier          = country filter, e.g. "Israel"
 *   secondaryIdentifier = site origin (default https://careers.checkpoint.com)
 * Job page: /jobs/{id}/{slug}.
 */
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MAX_PAGES = 60;

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9֐-׿]+/g, "-")
    .replace(/^-+|-+$/g, "");

function toPosting(j: any, origin: string): NormalizedPosting | null {
  if (!j?.id) return null;
  const parts = [j.responsibility, j.description ? `<p><b>Requirements</b></p>${j.description}` : "", j.information].filter(Boolean);
  return {
    sourceJobId: String(j.id),
    title: String(j.title || "").trim(),
    company: "",
    city: String(j.city || "").trim(),
    country: String(j.country || "").trim(),
    description: htmlToText(parts.join("\n")) + (j.department ? `\n\nDepartment: ${j.department}` : ""),
    applyUrl: `${origin}/jobs/${j.id}/${slug(String(j.title || ""))}`,
    seniority: j.seniority ? [String(j.seniority)] : [],
  };
}

export const checkpoint: Adapter = async (identifier, secondaryIdentifier) => {
  const country = identifier || "Israel";
  const origin = (secondaryIdentifier || "https://careers.checkpoint.com").replace(/\/+$/, "");
  const headers = { "User-Agent": UA, Accept: "text/html,application/json" };

  // Page 1 + the build id come from the HTML.
  const first = await fetchText(`${origin}/jobs?country=${encodeURIComponent(country)}`, { headers, cache: "no-store" });
  if (!first.ok) throw new Error(`Check Point: HTTP ${first.status}`);
  const m = first.text.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("Check Point: no __NEXT_DATA__ on the jobs page");
  let next: any;
  try {
    next = JSON.parse(m[1]);
  } catch {
    throw new Error("Check Point: __NEXT_DATA__ is not JSON");
  }
  const buildId = String(next?.buildId || "");
  const result = next?.props?.pageProps?.result ?? {};
  const pages = Math.max(1, Number(result.numberOfPages) || 1);
  const out: NormalizedPosting[] = [];
  for (const j of result.jobPostingsList ?? []) {
    const p = toPosting(j, origin);
    if (p) out.push(p);
  }

  let incomplete: string | null = null;
  for (let page = 2; page <= Math.min(pages, MAX_PAGES); page++) {
    const r = await fetchJson(`${origin}/_next/data/${buildId}/jobs.json?country=${encodeURIComponent(country)}&page=${page}`, { headers, cache: "no-store" }).catch((e) => ({ ok: false, status: 0, data: null, error: e }));
    if (!r.ok) {
      incomplete = `page ${page} of ${pages} failed (HTTP ${r.status})`;
      break;
    }
    const list: any[] = r.data?.pageProps?.result?.jobPostingsList ?? [];
    if (!list.length) break;
    for (const j of list) {
      const p = toPosting(j, origin);
      if (p) out.push(p);
    }
  }
  if (!incomplete && pages > MAX_PAGES) incomplete = `${pages} pages exceed the ${MAX_PAGES} cap`;
  return adapterResult(out, incomplete && `Check Point: ${incomplete}`);
};
