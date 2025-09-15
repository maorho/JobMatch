import express, { Request, Response } from "express";
import cors from "cors";
import puppeteer, { Browser, Page } from "puppeteer";

const app = express();
const PORT = 4000;

app.use(cors());

// ------------ extractors (עוטפים page.evaluate) ------------
async function extractDescripton(page: Page) {
  return page.evaluate(() => {
    const norm = (s: string) =>
      (s || "")
        .replace(/\u00A0/g, " ")
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
  const jobUrl = req.query.url as string;

  if (!jobUrl) {
    res.status(400).json({ error: "Missing job URL" });
    return;
  }

  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );

    console.log(`🌐 Navigating to: ${jobUrl}`);
    await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
    // תן זמן קצר ל־SPA לרנדר
    try {
      await page.waitForFunction(
        () => !!document.querySelector("h1,h2,h3") || !!document.querySelector("a.MuiButtonBase-root"),
        { timeout: 8000 }
      );
    } catch {}

    const description = await extractDescripton(page);
    const openRef = await findOpenRef(page);

    res.json({
      finalUrl: openRef || null,
      jobdescription: description || null
    });

  } catch (err: any) {
    console.error("❌ Puppeteer error:", err?.message || err);
    res.status(500).json({ error: "Failed to process job URL" });
  } finally {
    await browser?.close();
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Puppeteer server running at http://localhost:${PORT}`);
});
