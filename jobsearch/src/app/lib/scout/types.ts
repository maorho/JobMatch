import * as cheerio from "cheerio";

/** A job posting normalized across every ATS adapter. */
export type NormalizedPosting = {
  sourceJobId: string; // stable id from the source, used for dedup
  title: string;
  company: string;
  city: string;
  country: string;
  description: string; // plain text
  applyUrl: string;
  postedAt?: Date;
  seniority?: string[];
};

export type AtsType =
  | "greenhouse"
  | "lever"
  | "comeet"
  | "ashby"
  | "smartrecruiters"
  | "recruitee"
  | "workable"
  | "serpapi"
  | "amazon"
  | "workday"
  | "google"
  | "apple"
  | "eightfold"
  | "html"
  | "generic";

/**
 * A list the adapter could not finish (a page after the first failed, a cap
 * was hit before the reported total, the total was not reached). The postings
 * are real and get ingested; the list is just not the whole board, so runScout
 * must not soft-close anything against it.
 */
export type PartialPostings = { postings: NormalizedPosting[]; complete: boolean; reason?: string };

/**
 * What an adapter resolves with. A plain array means "this is the COMPLETE
 * current board" (every single-call adapter returns one). Paginating adapters
 * return `{ postings, complete: false, reason }` when they could not deliver
 * the whole board, instead of throwing — throwing is reserved for "nothing
 * usable" (the very first page failed), so a big board still ingests.
 */
export type AdapterResult = NormalizedPosting[] | PartialPostings;

export type Adapter = (
  identifier: string,
  secondaryIdentifier?: string
) => Promise<AdapterResult>;

/** Adapters that make one call and always return the whole board (narrower type, so callers can index the array). */
export type ListAdapter = (
  identifier: string,
  secondaryIdentifier?: string
) => Promise<NormalizedPosting[]>;

/** Arrays are complete; objects say so themselves. */
export function toPartialPostings(r: AdapterResult): PartialPostings {
  if (Array.isArray(r)) return { postings: r, complete: true };
  return { postings: Array.isArray(r?.postings) ? r.postings : [], complete: r?.complete === true, reason: r?.reason };
}

/** Build the result of a paginating adapter: the plain array when complete, the partial shape otherwise. */
export function adapterResult(postings: NormalizedPosting[], incompleteReason: string | null): AdapterResult {
  return incompleteReason ? { postings, complete: false, reason: incompleteReason } : postings;
}

export const DEFAULT_FETCH_TIMEOUT_MS = 20_000;

/**
 * `fetch` with a hard timeout on the HEADERS only. Prefer fetchJson/fetchText:
 * this one returns as soon as headers arrive, so a body that stalls afterwards
 * is not covered. Kept for callers that only look at the status.
 */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = DEFAULT_FETCH_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error(`timed out after ${Math.round(ms / 1000)}s: ${url}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * One timer for headers AND body: the abort signal cancels a stalled body read
 * on real fetch, and the race rejects even when a (stubbed) body ignores it.
 * Looks up `fetch` at call time so tests can stub the global.
 */
async function timedFetch<T>(url: string, init: RequestInit, ms: number, read: (res: Response) => Promise<T>, fetchImpl?: FetchImpl): Promise<T> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutError = () => new Error(`timed out after ${Math.round(ms / 1000)}s: ${url}`);
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(timeoutError());
    }, ms);
  });
  const work = (async () => {
    const res = await (fetchImpl || fetch)(url, { ...init, signal: ctrl.signal });
    return read(res);
  })();
  try {
    return await Promise.race([work, timeout]);
  } catch (e: any) {
    if (e?.name === "AbortError") throw timeoutError();
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Don't hold a socket open for an error body nobody reads. */
const discardBody = (res: Response) => {
  try {
    void res.body?.cancel().catch(() => {});
  } catch {
    /* stubs have no stream */
  }
};

export type JsonReply<T = any> = { ok: boolean; status: number; data: T | null };
export type TextReply = { ok: boolean; status: number; text: string };

/**
 * GET/POST and parse JSON, with the timeout covering the whole body. `data` is
 * parsed only for a 2xx; a 2xx that is not JSON throws (callers that expect
 * HTML past the last page catch it).
 */
export async function fetchJson<T = any>(url: string, init: RequestInit = {}, ms = DEFAULT_FETCH_TIMEOUT_MS, fetchImpl?: FetchImpl): Promise<JsonReply<T>> {
  return timedFetch(url, init, ms, async (res) => {
    if (!res.ok) {
      discardBody(res);
      return { ok: false, status: res.status, data: null };
    }
    return { ok: true, status: res.status, data: (await res.json()) as T };
  }, fetchImpl);
}

/** Same as fetchJson for HTML/text bodies. */
export async function fetchText(url: string, init: RequestInit = {}, ms = DEFAULT_FETCH_TIMEOUT_MS, fetchImpl?: FetchImpl): Promise<TextReply> {
  return timedFetch(url, init, ms, async (res) => {
    if (!res.ok) {
      discardBody(res);
      return { ok: false, status: res.status, text: "" };
    }
    return { ok: true, status: res.status, text: await res.text() };
  }, fetchImpl);
}

function decodeEntities(s: string): string {
  return (s || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&"); // keep last so earlier entities decode first
}

/**
 * Strip HTML (possibly entity-escaped, as Greenhouse returns) to clean text
 * while KEEPING the document structure: block elements become line breaks,
 * list items become "• " bullets, headings get a blank line around them.
 * Plain `$.text()` glued "…audit work.Key ResponsibilitiesSupport client…"
 * into one wall of text; this keeps each section readable and lets the UI
 * render headings and bullet lists.
 */
export function htmlToText(html: string): string {
  if (!html) return "";
  let s = decodeEntities(html);
  // If the markup was escaped twice (common in ATS feeds), decode again.
  if (/&lt;\/?[a-z]/i.test(s)) s = decodeEntities(s);
  s = s
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|section|article|tr|table|ul|ol|blockquote)\s*>/gi, "\n\n")
    .replace(/<\s*\/\s*(h[1-6])\s*>/gi, "\n\n")
    .replace(/<\s*(h[1-6])(\s[^>]*)?>/gi, "\n\n")
    .replace(/<\s*li(\s[^>]*)?>/gi, "\n• ")
    .replace(/<\s*\/\s*li\s*>/gi, "\n")
    .replace(/<\s*(p|div|section|article|tr)(\s[^>]*)?>/gi, "\n")
    .replace(/<\s*(td|th)(\s[^>]*)?>/gi, " ");
  const $ = cheerio.load(s);
  return $.text()
    .replace(/\r/g, "")
    .replace(/ /g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
    .join("\n")
    // `<li><p>text</p></li>` (Eightfold, some Workday feeds) puts the marker and its text on consecutive lines: rejoin them.
    .replace(/•[ \t]*\n[ \t]*(?=[^\s•])/g, "• ")
    // Empty `<li></li>` items leave a bare marker: drop it.
    .replace(/(^|\n)•[ \t]*(?=\n|$)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Best-effort split of a free-text location into city + country. */
export function parseLocation(name: string): { city: string; country: string } {
  const parts = (name || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { city: "", country: "Unknown" };
  if (parts.length === 1) return { city: parts[0], country: "Unknown" };
  return { city: parts[0], country: parts[parts.length - 1] };
}
