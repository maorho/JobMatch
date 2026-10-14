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
 * An adapter turns a company's ATS identifier into normalized postings.
 * Contract: the list it resolves with is the COMPLETE current board. An
 * adapter that cannot deliver that (a later page failed, a hard cap was hit
 * before the reported total) must throw, so the source is recorded as errored
 * and nothing is reconciled against a partial list.
 */
export type Adapter = (
  identifier: string,
  secondaryIdentifier?: string
) => Promise<NormalizedPosting[]>;

export const DEFAULT_FETCH_TIMEOUT_MS = 20_000;

/**
 * `fetch` with a hard timeout. Every outbound call the Scout makes goes through
 * here: an ATS that stops answering must cost one timeout, not a whole cron
 * budget. Looks up `fetch` at call time so tests can stub the global.
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
