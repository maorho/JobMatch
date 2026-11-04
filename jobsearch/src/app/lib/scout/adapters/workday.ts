import { Adapter, AdapterHint, NormalizedPosting, adapterResult, fetchJson, htmlToText } from "../types";
import { normalizeLocation } from "@/app/lib/locations/normalizeLocation";

/**
 * Generic Workday adapter (many large companies run on *.myworkdayjobs.com).
 *   identifier          = host, e.g. "nvidia.wd5.myworkdayjobs.com"
 *   secondaryIdentifier = "<tenant>/<site>", e.g. "nvidia/NVIDIAExternalCareerSite"
 * Searches for Israel, then fetches each hit's detail (description + the
 * precise locations) and keeps the postings that really are in Israel. A
 * multi-location hit lists as "3 Locations" in the search and only the
 * detail says whether Israel is one of them, so the search text alone is
 * never trusted to drop a posting. Details are fetched a few at a time
 * (NVIDIA alone has ~430 Israel hits; one at a time did not fit the
 * per-source deadline, which is why the catalogue showed 40 of them).
 * Postings the caller already holds (hint.knownIds) are returned from the
 * search hit alone, without a detail call, so after the first full walk a
 * run only pays for what is new.
 * Only a failed FIRST search page throws; a later failure or a cap returns
 * the postings marked incomplete (see AdapterResult). Workday is never
 * reconciled anyway (not in COMPLETE_FEED_ATS) — the flag is for the log.
 */
const LIMIT = 20;
const MAX_RESULTS = 1000;
const MAX_DETAIL = 600;
const DETAIL_CONCURRENCY = 8;
/** Stop starting detail calls past this, inside the 120s per-source deadline (runScout's SOURCE_DEADLINE_BY_ATS). */
const DETAIL_BUDGET_MS = 100_000;

const mentionsIsrael = (s: unknown) => /israel/i.test(String(s || ""));
/** "Israel, Tel Aviv", "Tel Aviv, Israel", but also the city-only strings some tenants use ("Yokneam", "IL - Petah Tikva"). */
const inIsrael = (s: unknown) => mentionsIsrael(s) || normalizeLocation({ city: String(s || "") }).country === "Israel";
/** "3 Locations" / "2 Locations": the search does not say where; the detail will. */
const isMultiLocation = (s: unknown) => /^\s*\d+\s+locations?\s*$/i.test(String(s || ""));

/** The Israeli city out of a Workday location string ("Israel, Yokneam" / "Tel Aviv, Israel" / "IL - Petah Tikva"), or "". */
function israeliCity(loc: string): string {
  const n = normalizeLocation({ city: loc });
  if (n.country === "Israel" && n.city) return n.city;
  return (
    loc
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x && !mentionsIsrael(x))
      .pop() || ""
  );
}

const jobIdOf = (p: any) => {
  const jr = String(p.externalPath || "").match(/_([A-Za-z]*\d+)$/);
  return jr ? jr[1] : "";
};

export const workday: Adapter = async (identifier, secondaryIdentifier, hint?: AdapterHint) => {
  const host = identifier;
  const [tenant, site] = String(secondaryIdentifier || "").split("/");
  if (!host || !tenant || !site) {
    throw new Error("workday needs host + '<tenant>/<site>'");
  }
  const base = `https://${host}/wday/cxs/${tenant}/${site}`;
  const startedAt = Date.now();

  // 1) Page the search for Israel. Keep what is in Israel for sure, and what might be (multi-location).
  const candidates: any[] = [];
  let total = 0;
  let offset = 0;
  let incomplete: string | null = null;
  for (; offset < MAX_RESULTS; offset += LIMIT) {
    let data: any;
    try {
      const res = await fetchJson(`${base}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
        body: JSON.stringify({ searchText: "Israel", limit: LIMIT, offset, appliedFacets: {} }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Workday ${host}: HTTP ${res.status} at offset ${offset}`);
      data = res.data;
    } catch (e) {
      if (offset === 0) throw e;
      incomplete = `search page at offset ${offset} failed: ${(e as Error).message}`;
      break;
    }
    const posts: any[] = data?.jobPostings ?? [];
    // Workday reports `total` on the first page only; later pages omit it (reading it as 0 there ended the
    // walk after two pages, which is how NVIDIA's ~430 Israel postings showed up as 40).
    if (offset === 0 || Number(data?.total) > 0) total = Number(data?.total) || total;
    if (posts.length === 0) break;
    for (const p of posts) {
      if (/\/Israel[-/]/i.test(p.externalPath || "") || inIsrael(p.locationsText) || isMultiLocation(p.locationsText)) candidates.push(p);
    }
    if (posts.length < LIMIT || offset + LIMIT >= total) break;
  }
  if (!incomplete && offset >= MAX_RESULTS && total > MAX_RESULTS) {
    incomplete = `${total} search results exceed the ${MAX_RESULTS} cap`;
  }

  // 2) Known postings come back as they are listed (the catalogue has their description); the rest get a detail
  //    call (description + precise locations), a few at a time, and only the Israeli ones are kept.
  const out: NormalizedPosting[] = [];
  const known = hint?.knownIds;
  const toFetch: any[] = [];
  for (const p of candidates) {
    const id = jobIdOf(p);
    if (known && id && known.has(id)) {
      const loc = String(p.locationsText || "");
      out.push({ sourceJobId: id, title: p.title || "", company: "", city: inIsrael(loc) ? israeliCity(loc) : "", country: "Israel", description: "", applyUrl: `https://${host}/${site}${p.externalPath}` });
    } else {
      toFetch.push(p);
    }
  }
  if (!incomplete && toFetch.length > MAX_DETAIL) {
    incomplete = `${toFetch.length} new postings, details fetched for the first ${MAX_DETAIL}`;
  }
  const queue = toFetch.slice(0, MAX_DETAIL);
  let outOfTime = false;
  const worker = async () => {
    for (;;) {
      const p = queue.shift();
      if (!p) return;
      if (Date.now() - startedAt > DETAIL_BUDGET_MS) {
        outOfTime = true;
        return;
      }
      try {
        const r = await fetchJson(`${base}${p.externalPath}`, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
        if (!r.ok) continue;
        const info = r.data?.jobPostingInfo ?? {};
        const locations: string[] = [info.location, ...(Array.isArray(info.additionalLocations) ? info.additionalLocations : [])].filter(Boolean).map(String);
        const here = locations.find(inIsrael) || (locations.length === 0 && inIsrael(p.locationsText) ? String(p.locationsText) : "");
        if (!here) continue; // a multi-location posting that turned out not to include Israel
        out.push({
          sourceJobId: jobIdOf(p) || String(info.id || p.externalPath),
          title: info.title || p.title || "",
          company: "",
          city: israeliCity(here),
          country: "Israel",
          description: htmlToText(info.jobDescription || ""),
          applyUrl: info.externalUrl || `https://${host}/${site}${p.externalPath}`,
        });
      } catch {
        // skip this posting
      }
    }
  };
  await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, worker));
  if (outOfTime) incomplete = incomplete || `details ran out of time after ${out.length} postings (${queue.length} left)`;
  return adapterResult(out, incomplete && `Workday ${host}: ${incomplete}`);
};
