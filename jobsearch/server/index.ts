import express, { Request, Response } from "express";
import cors from "cors";
import puppeteer, { Browser, Page } from "puppeteer";
import dns from "dns/promises";
import net from "net";
import path from "path";
import dotenv from "dotenv";

// Load the Next app's env so SCRAPER_TOKEN/CRON_SECRET match between processes.
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

const app = express();
const PORT = 4000;

// Only allow the configured app origin to call this server from a browser;
// the real caller is the Next server (server-to-server, no CORS needed).
const ALLOWED_ORIGIN = process.env.SCRAPER_ALLOWED_ORIGIN || "";
app.use(cors(ALLOWED_ORIGIN ? { origin: ALLOWED_ORIGIN } : { origin: false }));

// Shared secret so only our own backend can drive the scraper.
const SCRAPER_TOKEN = process.env.SCRAPER_TOKEN || process.env.CRON_SECRET || "";

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
  // Auth: require the shared token (unless none is configured locally).
  if (SCRAPER_TOKEN) {
    const token = (req.query.token as string) || req.get("x-scraper-token") || "";
    if (token !== SCRAPER_TOKEN) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
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
  if (SCRAPER_TOKEN) {
    const token = (req.query.token as string) || req.get("x-scraper-token") || "";
    if (token !== SCRAPER_TOKEN) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
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
  if (SCRAPER_TOKEN) {
    const token = (req.query.token as string) || req.get("x-scraper-token") || "";
    if (token !== SCRAPER_TOKEN) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
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

app.listen(PORT, () => {
  console.log(`🚀 Puppeteer server running at http://localhost:${PORT}`);
});
