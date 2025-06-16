import express, { Request, Response } from "express";
import cors from "cors";
import puppeteer from "puppeteer";

const app = express();
const PORT = 4000;

app.use(cors());

app.get("/api/open-job", async (req: Request, res: Response): Promise<void> => {
  const jobUrl = req.query.url as string;

  if (!jobUrl) {
    res.status(400).json({ error: "Missing job URL" });
    return;
  }

  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    console.log(`🌐 Navigating to: ${jobUrl}`);
    await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 15000 });

    // ממתין לטעינת כל הכפתורים
    await page.waitForSelector("a.MuiButtonBase-root", { timeout: 10000 });

    // ניסיון לקרוא את href של כפתור "Open" עם timeout של 5 שניות
    const openHref = await Promise.race([
      page.evaluate(() => {
        const links = Array.from(document.querySelectorAll("a.MuiButtonBase-root"));
        for (const link of links) {
          const text = link.textContent?.trim().toLowerCase();
          if ((text === "open" || text === "apply")&& link instanceof HTMLAnchorElement) {
            return link.href;
          }
        }
        return null;
      }),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("⏱️ Timeout extracting href")), 5000)
      ),
    ]);

    await browser.close();

    if (openHref) {
      console.log("✅ Found Open button href:", openHref);
      res.json({ finalUrl: openHref });
      return;
    } else {
      console.warn("⚠️ Open button not found or no href");
      res.status(404).json({ error: "Open button not found or has no href" });
      return;
    }
  } catch (err: any) {
    console.error("❌ Error in Puppeteer:", err.message);
    res.status(500).json({ error: "Failed to process job URL" });
    return;
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Puppeteer server running at http://localhost:${PORT}`);
});
