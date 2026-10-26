import express, { Request, Response } from "express";
import cors from "cors";
import puppeteer, { Browser, Page } from "puppeteer";
import dns from "dns/promises";
import net from "net";
import path from "path";
import fs from "fs";
import os from "os";
import dotenv from "dotenv";
import OpenAI from "openai";
import http from "http";
import crypto from "crypto";
import { runFormAgent, type AgentContext } from "./formAgent";
import { attachPhoneBridge } from "./phone";

// Load the Next app's env so SCRAPER_TOKEN/CRON_SECRET match between processes.
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

const app = express();
const PORT = Number(process.env.PORT) || 4000;

// Only allow the configured app origin to call this server from a browser;
// the real caller is the Next server (server-to-server, no CORS needed).
const ALLOWED_ORIGIN = process.env.SCRAPER_ALLOWED_ORIGIN || "";
app.use(cors(ALLOWED_ORIGIN ? { origin: ALLOWED_ORIGIN } : { origin: false }));

// Shared secret so only our own backend can drive the scraper. Always
// required: a production process without one refuses to start, and a dev
// process without one answers 401 to everything (never an open server).
const SCRAPER_TOKEN = process.env.SCRAPER_TOKEN || process.env.CRON_SECRET || "";
if (!SCRAPER_TOKEN) {
  const msg = "SCRAPER_TOKEN (or CRON_SECRET) is not set — the scraper server would be open to anyone.";
  if (process.env.NODE_ENV === "production") {
    console.error(`❌ ${msg}`);
    process.exit(1);
  }
  console.error(`❌ ${msg} Every request will be rejected until it is configured.`);
}
/** Constant-time check of the token a request carries (query ?token= or x-scraper-token header). */
function tokenOk(presented: string): boolean {
  if (!SCRAPER_TOKEN || !presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(SCRAPER_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- SSRF guard: only public http(s) hosts, never internal/metadata/file ----
function isPrivateIp(ip: string): boolean {
  // Normalize IPv4-mapped IPv6 (e.g. ::ffff:10.0.0.1).
  const v = ip.replace(/^::ffff:/i, "");
  if (net.isIPv4(v)) {
    return (
      /^0\./.test(v) ||
      /^127\./.test(v) ||
      /^10\./.test(v) ||
      /^192\.168\./.test(v) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(v) ||
      /^169\.254\./.test(v)
    );
  }
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    return (
      low === "::1" ||
      low.startsWith("fe80") || // link-local
      low.startsWith("fc") || // unique local fc00::/7
      low.startsWith("fd")
    );
  }
  return true; // unknown format → treat as unsafe
}

async function isSafeUrl(raw: string): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return false;

  // Resolve the host and reject if ANY resolved address is private/internal,
  // which also blocks a public hostname that points at an internal IP.
  try {
    const addrs = await dns.lookup(host, { all: true });
    if (!addrs.length) return false;
    for (const a of addrs) {
      if (isPrivateIp(a.address)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ---- Browser reuse + a small concurrency limit (no browser-per-request) ----
let browserPromise: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  const browser = await browserPromise;
  if (!browser.connected) {
    browserPromise = null;
    return getBrowser();
  }
  return browser;
}

const MAX_CONCURRENCY = Number(process.env.SCRAPER_CONCURRENCY || "3");
let inFlight = 0;

// ------------ extractors (עוטפים page.evaluate) ------------
async function extractDescripton(page: Page) {
  return page.evaluate(() => {
    const norm = (s: string) =>
      (s || "")
        .replace(/ /g, " ")
        .replace(/\s{2,}/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    const startTexts = [
          "Description","Job Description","תיאור המשרה",
          "About Us","About the Company","About the job","Role Description","Role Overview","Overview","Position Overview"
        ];
    const stopTexts = ["About The Team", "Basic Qualifications", "Preferred Qualifications", "Company"];

    const findStart = (): Element | null => {
      const isMatch = (el: Element) => startTexts.map(t => t.toLowerCase()).includes(norm(el.textContent || "").toLowerCase());
      let start = Array.from(document.querySelectorAll<HTMLElement>("h1,h2,h3")).find(isMatch) || null;
      if (!start) {
        start = Array.from(document.querySelectorAll<HTMLElement>("h1,h2,h3,div,span")).find(isMatch) || null;
      }
      return start;
    };

    const isStopHeading = (el: Element) => {
      if (!el.matches("h1,h2,h3")) return false;
      const t = norm(el.textContent || "").toLowerCase();
      return stopTexts.map(s => s.toLowerCase()).includes(t);
    };

    const start = findStart();
    if (!start) return null;

    const parts: string[] = [];
    let node: ChildNode | null = start.nextSibling; // כולל TEXT NODES

    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        if (isStopHeading(el)) break;

        if (el.matches("ul,ol")) {
          const items = Array.from(el.querySelectorAll("li"))
            .map(li => "• " + norm(li.textContent || ""))
            .filter(Boolean);
          if (items.length) parts.push(...items);
        } else {
          const t = norm((el as HTMLElement).innerText || el.textContent || "");
          if (t) parts.push(t);
        }
      } else if (node.nodeType === Node.TEXT_NODE) {
        const t = norm(node.textContent || "");
        if (t) parts.push(t);
      }
      node = node.nextSibling;
    }

    const result = parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    return result || null;
  });
}

async function findOpenRef(page: Page) {
  return page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
    for (const a of anchors) {
      const txt = (a.innerText || a.textContent || "").toLowerCase().trim();
      if (/(apply|apply now|open|read more|submit|שלח|הגש|להגשה|קרא עוד|פרטים)/.test(txt)) {
        return a.href;
      }
    }
    const mui = Array.from(document.querySelectorAll<HTMLAnchorElement>("a.MuiButtonBase-root"));
    for (const link of mui) {
      const text = (link.textContent || "").toLowerCase().trim();
      if (text.includes("open") || text.includes("apply") || text.includes("קרא") || text.includes("הגש")) {
        if (link.href) return link.href;
      }
    }
    return null;
  });
}
// ------------------------------------------------------------

app.get("/api/open-job", async (req: Request, res: Response): Promise<void> => {
  // Auth: the shared token is always required.
  if (!tokenOk((req.query.token as string) || req.get("x-scraper-token") || "")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const jobUrl = req.query.url as string;
  if (!jobUrl) {
    res.status(400).json({ error: "Missing job URL" });
    return;
  }
  if (!(await isSafeUrl(jobUrl))) {
    res.status(400).json({ error: "URL not allowed" });
    return;
  }

  if (inFlight >= MAX_CONCURRENCY) {
    res.status(503).json({ error: "Busy, try again" });
    return;
  }

  inFlight++;
  let page: Page | null = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );

    console.log(`🌐 Navigating to: ${jobUrl}`);
    await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
    try {
      await page.waitForFunction(
        () => !!document.querySelector("h1,h2,h3") || !!document.querySelector("a.MuiButtonBase-root"),
        { timeout: 8000 }
      );
    } catch {}

    const description = await extractDescripton(page);
    const openRef = await findOpenRef(page);

    res.json({ finalUrl: openRef || null, jobdescription: description || null });
  } catch (err: any) {
    console.error("❌ Puppeteer error:", err?.message || err);
    res.status(500).json({ error: "Failed to process job URL" });
  } finally {
    inFlight--;
    await page?.close().catch(() => {});
  }
});

// Detect the ATS behind a (possibly JS-rendered) careers page by rendering it
// and capturing the network requests + markup that reference an ATS.
const ATS_HOST_RE =
  /greenhouse\.io|lever\.co|ashbyhq\.com|comeet\.co|myworkdayjobs\.com|smartrecruiters\.com|recruitee\.com|workable\.com|teamtailor\.com|bamboohr\.com|personio/i;

app.get("/api/detect-ats", async (req: Request, res: Response): Promise<void> => {
  if (!tokenOk((req.query.token as string) || req.get("x-scraper-token") || "")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const pageUrl = req.query.url as string;
  if (!pageUrl) {
    res.status(400).json({ error: "Missing url" });
    return;
  }
  if (!(await isSafeUrl(pageUrl))) {
    res.status(400).json({ error: "URL not allowed" });
    return;
  }
  if (inFlight >= MAX_CONCURRENCY) {
    res.status(503).json({ error: "Busy, try again" });
    return;
  }

  inFlight++;
  let page: Page | null = null;
  const hits = new Set<string>();
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );
    page.on("request", (r) => {
      const u = r.url();
      if (ATS_HOST_RE.test(u)) hits.add(u);
    });

    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
    // Give client-side code time to fire its ATS XHRs.
    await new Promise((r) => setTimeout(r, 3500));

    // Also scan the rendered HTML for ATS URLs/markers.
    const html = await page.content();
    const urls = html.match(/https?:\/\/[^"'\s)]+/g) || [];
    for (const u of urls) if (ATS_HOST_RE.test(u)) hits.add(u);
    const embed = html.match(/job_board\?for=[a-z0-9_-]+/gi) || [];
    for (const e of embed) hits.add(`boards.greenhouse.io/embed/${e}`);

    res.json({ requests: [...hits] });
  } catch (err: any) {
    console.error("❌ detect-ats error:", err?.message || err);
    res.status(500).json({ error: "Failed to detect ATS" });
  } finally {
    inFlight--;
    await page?.close().catch(() => {});
  }
});

// Render a page and capture JSON responses from XHRs whose URL matches `match`.
// Lets us read APIs that block direct server calls but work inside a browser
// (e.g. Microsoft/Google careers). Optionally scroll to trigger lazy loading.
app.get("/api/capture", async (req: Request, res: Response): Promise<void> => {
  if (!tokenOk((req.query.token as string) || req.get("x-scraper-token") || "")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const pageUrl = req.query.url as string;
  const match = (req.query.match as string) || "";
  if (!pageUrl || !match) {
    res.status(400).json({ error: "Missing url or match" });
    return;
  }
  if (!(await isSafeUrl(pageUrl))) {
    res.status(400).json({ error: "URL not allowed" });
    return;
  }
  if (inFlight >= MAX_CONCURRENCY) {
    res.status(503).json({ error: "Busy, try again" });
    return;
  }

  // `match` is a regex (e.g. "job|position|graphql"); fall back to a plain
  // substring if it doesn't compile so a stray "(" can't break the endpoint.
  let matcher: (u: string) => boolean;
  try {
    const re = new RegExp(match, "i");
    matcher = (u) => re.test(u);
  } catch {
    matcher = (u) => u.includes(match);
  }

  inFlight++;
  let page: Page | null = null;
  const captured: any[] = [];
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );
    page.on("response", async (resp) => {
      try {
        const url = resp.url();
        if (matcher(url)) {
          const ct = resp.headers()["content-type"] || "";
          if (ct.includes("json")) {
            // Keep the request URL alongside the body so the caller can learn
            // the exact API endpoint (that is the point of capture).
            captured.push({ url, status: resp.status(), body: await resp.json() });
          }
        }
      } catch {
        /* ignore bodies we can't read */
      }
    });

    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 6000));
    // A few scrolls to trigger lazy-loaded pages.
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
      await new Promise((r) => setTimeout(r, 1500));
    }

    res.json({ captured });
  } catch (err: any) {
    console.error("❌ capture error:", err?.message || err);
    res.status(500).json({ error: "Failed to capture" });
  } finally {
    inFlight--;
    await page?.close().catch(() => {});
  }
});

// =====================================================================
// POST /api/apply — fill and submit an ATS application form on behalf of a
// candidate (the Applier agent). Knows Greenhouse and Lever well, tries a
// generic form otherwise, and reports `needs_user` instead of guessing
// whenever the form asks something it cannot answer (custom required
// questions, captcha, unknown layout). `dryRun: true` fills but never submits.
// =====================================================================
app.use(express.json({ limit: "15mb" }));

type ApplyProfile = { firstName: string; lastName: string; email: string; phone: string; linkedin?: string };
type ApplyAnswer = { selector: string; value: string };
type ApplyBody = { url: string; profile: ApplyProfile; resumePdfBase64?: string; resumeFileName?: string; coverNote?: string; dryRun?: boolean; answers?: ApplyAnswer[]; resumeText?: string; jobTitle?: string; company?: string; agent?: boolean };

// ---- The form agent's model (gpt-4o with the screenshot); disabled without a key ----
const AGENT_MODEL = process.env.APPLY_AGENT_MODEL || "gpt-4o";
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45_000, maxRetries: 1 }) : null;
const agentLlm = async (system: string, user: string, screenshotB64?: string): Promise<string> => {
  if (!openai) throw new Error("OPENAI_API_KEY missing on the apply server");
  const content: any[] = [{ type: "text", text: user }];
  if (screenshotB64) content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${screenshotB64}`, detail: "low" } });
  const res = await openai.chat.completions.create({ model: AGENT_MODEL, temperature: 0, max_tokens: 900, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content }] });
  return res.choices[0]?.message?.content || "{}";
};

/** Run the agent on the current page and translate its result to the /api/apply response shape. */
async function applyWithAgent(page: Page, body: ApplyBody, ats: string, tmpResume: string | null) {
  const ctx: AgentContext = { profile: body.profile, resumeText: body.resumeText || "", resumePath: tmpResume, jobTitle: body.jobTitle, company: body.company, coverNote: body.coverNote, dryRun: !!body.dryRun };
  const r = await runFormAgent(page, ctx, agentLlm, { maxSteps: 14, budgetMs: 150_000, screenshots: true });
  return { status: r.status, ats, mode: "agent", reason: r.reason, confirmation: r.confirmation, filled: r.filled, steps: r.steps.map((st) => ({ step: st.step, url: st.url, thought: st.thought, status: st.status, applied: st.applied })) };
}
type FormField = { selector: string; label: string; type: string; required: boolean; options?: string[]; value?: string };

function detectAts(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("greenhouse.io")) return "greenhouse";
  if (u.includes("lever.co")) return "lever";
  if (u.includes("comeet.co")) return "comeet";
  if (u.includes("ashbyhq.com")) return "ashby";
  if (u.includes("myworkdayjobs.com")) return "workday";
  if (u.includes("smartrecruiters.com")) return "smartrecruiters";
  return "unknown";
}

/** Type into the first selector that exists and is visible. Returns the selector used. */
async function fillFirst(page: Page, selectors: string[], value: string): Promise<string | null> {
  if (!value) return null;
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (!el) continue;
    const visible = await el.isVisible().catch(() => false);
    if (!visible) continue;
    await el.click({ clickCount: 3 }).catch(() => {});
    await el.type(value, { delay: 10 });
    return sel;
  }
  return null;
}

async function pageHasCaptcha(page: Page): Promise<boolean> {
  return page.evaluate(() => !!document.querySelector('iframe[src*="recaptcha"], .g-recaptcha, iframe[src*="hcaptcha"], .h-captcha, iframe[src*="turnstile"]'));
}

/** A captcha that actually demands interaction (the image-grid challenge is on screen). */
async function captchaChallengeVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const vis = (el: Element) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el as HTMLElement);
      return r.width > 50 && r.height > 50 && st.visibility !== "hidden" && st.display !== "none";
    };
    const challenge = Array.from(document.querySelectorAll('iframe[src*="recaptcha/api2/bframe"], iframe[title*="challenge" i], iframe[src*="hcaptcha.com/captcha"]'));
    return challenge.some((f) => vis(f) && vis(f.parentElement || f));
  });
}

/** Required inputs/selects/textareas on the page that are still empty (label text for the report). */
async function emptyRequiredFields(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    const els = Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input[required], select[required], textarea[required], [aria-required='true']"));
    for (const el of els) {
      const type = (el as HTMLInputElement).type || el.tagName.toLowerCase();
      if (type === "hidden" || type === "file" || type === "submit" || type === "checkbox" || type === "radio") continue;
      if ((el as HTMLElement).offsetParent === null) continue; // not visible
      const value = (el as HTMLInputElement).value;
      if (value && value.trim()) continue;
      const id = el.id;
      const label = (id && document.querySelector(`label[for="${id}"]`)?.textContent) || el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("name") || id || "field";
      const clean = label.replace(/\s+/g, " ").replace(/\*/g, "").trim().slice(0, 80);
      if (!seen.has(clean)) {
        seen.add(clean);
        out.push(clean);
      }
    }
    return out;
  });
}

/**
 * Every visible, still-empty input/select/textarea on the form, with a stable
 * selector and the label a human would read — the Applier answers these.
 */
async function collectFields(page: Page): Promise<FormField[]> {
  return page.evaluate(() => {
    const out: any[] = [];
    const seen = new Set<string>();
    const vis = (el: Element) => !!((el as HTMLElement).offsetParent || el.getClientRects().length);
    const labelFor = (el: Element) => {
      const id = el.id;
      let t = (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent) || el.getAttribute("aria-label") || "";
      if (!t) {
        const labelled = el.getAttribute("aria-labelledby");
        if (labelled) t = labelled.split(/\s+/).map((i) => document.getElementById(i)?.textContent || "").join(" ");
      }
      if (!t) t = el.closest("label")?.textContent || "";
      if (!t) {
        // Walk up a few levels: Lever/Greenhouse wrap the control in a div
        // and put the question text in a sibling (.application-label, label…).
        let node: Element | null = el.parentElement;
        for (let depth = 0; node && depth < 5 && !t; depth++, node = node.parentElement) {
          const lab = node.querySelector(":scope > label, :scope > legend, :scope > .application-label, :scope > .label, :scope > .text, :scope > h4, :scope > h5, :scope > div > label, :scope > .application-label > *");
          if (lab && !lab.contains(el)) t = lab.textContent || "";
          if (!t && node.matches(".application-question, .field, .form-group, fieldset")) {
            t = node.querySelector(".application-label, label, legend, .text")?.textContent || "";
          }
        }
      }
      if (!t) t = el.getAttribute("placeholder") || el.getAttribute("name") || id || "field";
      return t.replace(/\s+/g, " ").replace(/\*/g, "").replace(/✱/g, "").trim().slice(0, 120);
    };
    const selectorFor = (el: Element) => {
      if (el.id) return `#${CSS.escape(el.id)}`;
      const name = el.getAttribute("name");
      if (name) return `${el.tagName.toLowerCase()}[name="${name.replace(/"/g, '\\"')}"]`;
      return "";
    };
    const els = Array.from(document.querySelectorAll<HTMLElement>("input, select, textarea"));
    const radioGroups = new Set<string>();
    for (const el of els) {
      const input = el as HTMLInputElement;
      const type = (input.type || el.tagName.toLowerCase()).toLowerCase();
      if (["hidden", "submit", "button", "file", "search"].includes(type)) continue;
      if (!vis(el)) continue;
      if (/first_name|last_name|^email$|^phone$|keyword-filter|department-filter|office-filter/.test(input.name || el.id)) continue;
      const required = input.required || el.getAttribute("aria-required") === "true" || /\*/.test((el.closest(".field, .application-question, .form-group, fieldset") as HTMLElement)?.innerText?.slice(0, 200) || "");
      if (type === "radio" || type === "checkbox") {
        const key = input.name || el.id;
        if (!key || radioGroups.has(key)) continue;
        radioGroups.add(key);
        const group = Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${key.replace(/"/g, '\\"')}"]`));
        const options = group.map((g) => (g.id && document.querySelector(`label[for="${CSS.escape(g.id)}"]`)?.textContent) || g.closest("label")?.textContent || g.value).map((t) => (t || "").replace(/\s+/g, " ").trim()).filter(Boolean);
        const fs = group[0].closest("fieldset, .field, .application-question, .form-group");
        const label = (fs?.querySelector("legend, label, .application-label, .text")?.textContent || labelFor(group[0])).replace(/\s+/g, " ").replace(/\*/g, "").trim().slice(0, 120);
        if (group.some((g) => g.checked)) continue;
        out.push({ selector: `input[name="${key.replace(/"/g, '\\"')}"]`, label, type, required: required || group.some((g) => g.required), options });
        continue;
      }
      const selector = selectorFor(el);
      if (!selector || seen.has(selector)) continue;
      seen.add(selector);
      const value = (input.value || "").trim();
      if (value && type !== "select-one") continue;
      const comboLike = el.getAttribute("role") === "combobox" || el.getAttribute("aria-autocomplete") === "list";
      if (comboLike) {
        // react-select: the chosen value lives in a sibling, not in the input.
        const control = el.closest('[class*="control"], [class*="Control"]') || el.parentElement?.parentElement;
        if (control && control.querySelector('[class*="single-value"], [class*="singleValue"], [class*="multi-value"], [class*="multiValue"]')) continue;
      }
      if (el.tagName === "SELECT") {
        const sel = el as HTMLSelectElement;
        const chosen = sel.selectedOptions[0];
        if (chosen && chosen.value && !/select|choose|^-+$/i.test(chosen.textContent || "")) continue;
        out.push({ selector, label: labelFor(el), type: "select", required, options: Array.from(sel.options).map((o) => o.textContent?.trim() || "").filter((t) => t && !/^(select|choose|please)/i.test(t)).slice(0, 60) });
        continue;
      }
      const combo = el.getAttribute("role") === "combobox" || el.getAttribute("aria-autocomplete") === "list";
      out.push({ selector, label: labelFor(el), type: combo ? "combobox" : el.tagName === "TEXTAREA" ? "textarea" : type, required });
    }
    return out;
  });
}

/** Apply the Applier's answers: selects by option text, comboboxes by typing + Enter, radios by label, text by typing. */
async function fillAnswers(page: Page, fields: FormField[], answers: ApplyAnswer[]): Promise<string[]> {
  const applied: string[] = [];
  for (const a of answers) {
    const f = fields.find((x) => x.selector === a.selector);
    if (!f || !a.value) continue;
    try {
      if (f.type === "select") {
        const picked = await page.evaluate((sel, val) => {
          const el = document.querySelector(sel) as HTMLSelectElement | null;
          if (!el) return false;
          const v = val.toLowerCase();
          const opt = Array.from(el.options).find((o) => (o.textContent || "").trim().toLowerCase() === v) || Array.from(el.options).find((o) => (o.textContent || "").toLowerCase().includes(v));
          if (!opt) return false;
          el.value = opt.value;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }, f.selector, a.value);
        if (picked) applied.push(f.label);
      } else if (f.type === "radio" || f.type === "checkbox") {
        const clicked = await page.evaluate((sel, val) => {
          const group = Array.from(document.querySelectorAll<HTMLInputElement>(sel));
          const v = val.toLowerCase();
          const match = group.find((g) => {
            const t = ((g.id && document.querySelector(`label[for="${CSS.escape(g.id)}"]`)?.textContent) || g.closest("label")?.textContent || g.value || "").trim().toLowerCase();
            return t === v || t.includes(v);
          });
          if (!match) return false;
          match.click();
          return true;
        }, f.selector, a.value);
        if (clicked) applied.push(f.label);
      } else if (f.type === "combobox") {
        const el = await page.$(f.selector);
        if (!el) continue;
        await el.click();
        await el.type(a.value, { delay: 25 });
        // Async autocompletes (city lookups) can take a few seconds; poll for
        // a visible option, and if the full phrase finds nothing, retry with
        // its first word (e.g. "Tel Aviv, Israel" → "Tel").
        const optionsVisible = () => page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[role="option"], [class*="__option"], [id*="-option-"]')).some((o) => o.getClientRects().length && !/no (results|options|location)/i.test(o.textContent || "")));
        let seen = false;
        for (let i = 0; i < 15 && !(seen = await optionsVisible()); i++) await new Promise((r) => setTimeout(r, 400));
        if (!seen) {
          await el.click({ clickCount: 3 }).catch(() => {});
          await page.keyboard.press("Backspace");
          await el.type(a.value.split(/[,\s]+/)[0], { delay: 40 });
          for (let i = 0; i < 15 && !(seen = await optionsVisible()); i++) await new Promise((r) => setTimeout(r, 400));
        }
        const clicked = await page.evaluate((val) => {
          const v = val.toLowerCase();
          const opts = Array.from(document.querySelectorAll<HTMLElement>('[role="option"], [class*="__option"], [id*="-option-"]')).filter((o) => o.getClientRects().length);
          const best = opts.find((o) => (o.textContent || "").trim().toLowerCase() === v) || opts.find((o) => (o.textContent || "").toLowerCase().startsWith(v)) || opts.find((o) => (o.textContent || "").toLowerCase().includes(v)) || opts[0];
          if (!best) return false;
          best.click();
          return true;
        }, a.value);
        if (!clicked) await page.keyboard.press("Enter");
        await new Promise((r) => setTimeout(r, 400));
        applied.push(f.label);
      } else {
        const el = await page.$(f.selector);
        if (!el) continue;
        await el.click({ clickCount: 3 }).catch(() => {});
        await el.type(a.value, { delay: 5 });
        applied.push(f.label);
      }
    } catch (e: any) {
      console.warn("[apply] answer failed for", f.label, e?.message);
    }
  }
  return applied;
}

async function confirmationSeen(page: Page, startUrl: string): Promise<string | null> {
  const text: string = await page.evaluate(() => (document.body?.innerText || "").slice(0, 20000)).catch(() => "");
  const m = text.match(/(thank you[^.\n]{0,120}|application (?:has been |was )?(?:submitted|received)[^.\n]{0,80}|we(?:'ve| have) received your application[^.\n]{0,80}|תודה[^.\n]{0,80}|המועמדות (?:נשלחה|התקבלה)[^.\n]{0,80})/i);
  if (m) return m[0].trim();
  const url = page.url();
  if (url !== startUrl && /confirmation|thank|success|submitted/i.test(url)) return url;
  return null;
}

async function formErrors(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll(".field-error, .error-message, .form-error, [role='alert'], .invalid-feedback, .helper-text--error, .error"));
    return nodes.map((n) => (n.textContent || "").replace(/\s+/g, " ").trim()).filter((t) => t && t.length < 160).slice(0, 6);
  });
}

app.post("/api/apply", async (req: Request, res: Response): Promise<void> => {
  if (!tokenOk((req.query.token as string) || req.get("x-scraper-token") || "")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const body = (req.body || {}) as ApplyBody;
  const { url, profile } = body;
  if (!url || !profile?.email || !profile?.firstName) {
    res.status(400).json({ error: "Missing url or profile" });
    return;
  }
  if (!(await isSafeUrl(url))) {
    res.status(400).json({ error: "URL not allowed" });
    return;
  }
  if (inFlight >= MAX_CONCURRENCY) {
    res.status(503).json({ error: "Busy, try again" });
    return;
  }

  const ats = detectAts(url);
  // Lever's posting page is read-only; the form lives under /apply.
  const targetUrl = ats === "lever" && !/\/apply\/?(\?|$)/.test(url) ? url.replace(/\/?(\?.*)?$/, "/apply$1") : url;

  inFlight++;
  let page: Page | null = null;
  let tmpResume: string | null = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
    await page.setViewport({ width: 1280, height: 1600 });
    await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 40000 });
    await page.waitForSelector("form, input[type=file]", { timeout: 10000 }).catch(() => {});

    const wantAgent = body.agent !== false && !!openai;
    if (ats === "comeet" || ats === "workday" || ats === "ashby" || ats === "smartrecruiters" || ats === "unknown") {
      if (!wantAgent) {
        res.json({ status: "needs_user", ats, reason: `${ats} application forms are multi-step — open the link and apply manually.` });
        return;
      }
      if (body.resumePdfBase64) {
        tmpResume = path.join(os.tmpdir(), `jm-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
        fs.writeFileSync(tmpResume, Buffer.from(body.resumePdfBase64, "base64"));
      }
      res.json(await applyWithAgent(page, body, ats, tmpResume));
      return;
    }
    // Greenhouse and Lever ship an invisible reCAPTCHA on every form; it only
    // blocks when a visible challenge pops up at submit, so note it and go on.
    const captchaPresent = await pageHasCaptcha(page);

    // Greenhouse (classic boards.greenhouse.io and the newer job-boards) and
    // Lever share the same handful of fields; the generic fallback guesses
    // by name/id/autocomplete.
    const filled: string[] = [];
    const fullName = `${profile.firstName} ${profile.lastName}`.trim();
    const first = await fillFirst(page, ["#first_name", "input[name='first_name']", "input[name*='first' i]", "input[autocomplete='given-name']", "input[id*='first' i]"], profile.firstName);
    const last = await fillFirst(page, ["#last_name", "input[name='last_name']", "input[name*='last' i]", "input[autocomplete='family-name']", "input[id*='last' i]"], profile.lastName);
    if (!first && !last) {
      const name = await fillFirst(page, ["input[name='name']", "input[autocomplete='name']", "input[name*='full' i]", "input[id*='name' i]"], fullName);
      if (name) filled.push("name");
    } else filled.push("first/last name");
    if (await fillFirst(page, ["#email", "input[name='email']", "input[type='email']", "input[autocomplete='email']"], profile.email)) filled.push("email");
    if (await fillFirst(page, ["#phone", "input[name='phone']", "input[type='tel']", "input[autocomplete='tel']", "input[name*='phone' i]"], profile.phone)) filled.push("phone");
    if (profile.linkedin) {
      if (await fillFirst(page, ["input[name='urls[LinkedIn]']", "input[name*='linkedin' i]", "input[id*='linkedin' i]", "input[autocomplete='url']"], profile.linkedin)) filled.push("linkedin");
    }
    if (body.coverNote) {
      if (await fillFirst(page, ["textarea[name='comments']", "#cover_letter_text", "textarea[name*='cover' i]", "textarea[name*='message' i]"], body.coverNote)) filled.push("cover note");
    }

    // Résumé upload: any file input (Greenhouse hides it behind a button; Lever uses input[name=resume]).
    if (body.resumePdfBase64) {
      tmpResume = path.join(os.tmpdir(), `jm-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
      fs.writeFileSync(tmpResume, Buffer.from(body.resumePdfBase64, "base64"));
      const fileInput = (await page.$("input[type=file][name*='resume' i], input[type=file][id*='resume' i], input#resume, input[type=file]")) as any;
      if (fileInput) {
        await fileInput.uploadFile(tmpResume);
        filled.push("resume");
        await new Promise((r) => setTimeout(r, 2500)); // let the ATS parse/attach it
      }
    }

    if (!filled.includes("email")) {
      if (wantAgent) {
        res.json(await applyWithAgent(page, body, ats, tmpResume));
        return;
      }
      res.json({ status: "needs_user", ats, reason: "Could not find a standard application form on this page.", filled, captchaPresent });
      return;
    }

    // Whatever the form still asks: fill the Applier's answers, then re-check.
    let fields = await collectFields(page);
    if (body.answers?.length) {
      const applied = await fillAnswers(page, fields, body.answers);
      filled.push(...applied.map((l) => `answer: ${l}`));
      await new Promise((r) => setTimeout(r, 500));
      fields = await collectFields(page);
    }
    const missingRequired = fields.filter((f) => f.required);
    const missing = missingRequired.map((f) => f.label);
    if (missing.length) {
      res.json({ status: "needs_user", ats, reason: `The form asks for: ${missing.join(", ")}.`, filled, missing, fields, captchaPresent });
      return;
    }
    if (body.dryRun) {
      res.json({ status: "ready", ats, filled, fields, captchaPresent });
      return;
    }

    const startUrl = page.url();
    const submit = await page.$("#submit_app, button#btn-submit, button[type=submit], input[type=submit]");
    if (!submit) {
      res.json({ status: "needs_user", ats, reason: "No submit button found.", filled });
      return;
    }
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => null), submit.click()]);
    await new Promise((r) => setTimeout(r, 2000));

    const confirmation = await confirmationSeen(page, startUrl);
    if (confirmation) {
      res.json({ status: "submitted", ats, filled, confirmation });
      return;
    }
    if (await captchaChallengeVisible(page)) {
      res.json({ status: "needs_user", ats, reason: "A captcha challenge appeared at submit — open the link and finish it yourself.", filled, captchaPresent });
      return;
    }
    const errors = await formErrors(page);
    const stillMissing = await emptyRequiredFields(page);
    if (errors.length || stillMissing.length) {
      res.json({ status: "needs_user", ats, reason: `The form rejected the submission: ${[...errors, ...stillMissing].join("; ")}`, filled });
      return;
    }
    res.json({ status: "failed", ats, reason: "Submitted but no confirmation was detected.", filled });
  } catch (err: any) {
    console.error("❌ apply error:", err?.message || err);
    res.status(500).json({ status: "failed", ats, error: err?.message || "Failed to apply" });
  } finally {
    inFlight--;
    if (tmpResume) fs.unlink(tmpResume, () => {});
    await page?.close().catch(() => {});
  }
});

// Liveness for the Next app (lib/apply/server.ts probes it once per auto-apply pass
// before paying for any résumé tailoring). No token: it reveals nothing but "up".
app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, inFlight, maxConcurrency: MAX_CONCURRENCY, agent: !!openai });
});

const httpServer = http.createServer(app);
attachPhoneBridge(httpServer);
httpServer.listen(PORT, () => {
  console.log(`🚀 Puppeteer server running at http://localhost:${PORT}`);
});
