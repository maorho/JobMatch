import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";

export const runtime = "nodejs";

type ResumeSection = {
  heading: string;
  items: any[];
};

// Load the Unicode font (Hebrew + Latin) once. WinAnsi built-ins crash on any
// non-Latin-1 character, so we embed DejaVuSans to support Hebrew résumés.
let fontCache: { regular: Buffer; bold: Buffer } | null = null;
function loadFonts() {
  if (fontCache) return fontCache;
  const dir = path.join(process.cwd(), "src/app/lib/fonts");
  fontCache = {
    regular: fs.readFileSync(path.join(dir, "DejaVuSans.ttf")),
    bold: fs.readFileSync(path.join(dir, "DejaVuSans-Bold.ttf")),
  };
  return fontCache;
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { structuredResume }: { structuredResume: ResumeSection[] } =
      await req.json();

    if (!structuredResume || !Array.isArray(structuredResume)) {
      return NextResponse.json(
        { error: "Invalid resume format" },
        { status: 400 }
      );
    }

    // --- PDF Setup ---
    const pdfDoc = await PDFDocument.create();
    const fontkit = (await import("fontkit")).default as any;
    pdfDoc.registerFontkit(fontkit);

    let font;
    let fontBold;
    let usingUnicode = true;
    try {
      const fonts = loadFonts();
      font = await pdfDoc.embedFont(fonts.regular, { subset: true });
      fontBold = await pdfDoc.embedFont(fonts.bold, { subset: true });
    } catch (e) {
      // Last-resort fallback (Latin only) so generation never hard-fails.
      console.error("⚠️ Unicode font load failed, falling back:", e);
      usingUnicode = false;
      font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    }

    // When using the Latin-only fallback, strip characters the built-in font
    // cannot encode so drawText never throws (e.g. on Hebrew).
    const safe = (t: string) =>
      usingUnicode ? t : (t || "").replace(/[^\x00-\xFF]/g, "");

    const pageSize: [number, number] = [595, 842]; // A4
    let page = pdfDoc.addPage(pageSize);

    const marginX = 50;
    const maxWidth = pageSize[0] - marginX * 2;
    let y = 800;

    // Ensures no overflow
    const ensureSpace = (height: number) => {
      if (y - height < 50) {
        page = pdfDoc.addPage(pageSize);
        y = 800;
      }
    };

    // Draw simple line
    const drawLine = (
      text: string,
      {
        size = 11,
        gap = 16,
        bold = false,
      }: { size?: number; gap?: number; bold?: boolean } = {}
    ) => {
      if (!text) return;

      ensureSpace(gap);
      page.drawText(safe(text), {
        x: marginX,
        y,
        size,
        font: bold ? fontBold : font,
      });
      y -= gap;
    };

    // Wrapped text drawing
    const drawWrapped = (
      text: string,
      {
        size = 11,
        gap = 16,
        bold = false,
      }: { size?: number; gap?: number; bold?: boolean } = {}
    ) => {
      if (!text || !text.trim()) return;

      const words = text.split(/\s+/);
      let line = "";

      for (const word of words) {
        const test = line ? line + " " + word : word;
        const width = (bold ? fontBold : font).widthOfTextAtSize(test, size);

        if (width > maxWidth) {
          ensureSpace(gap);
          page.drawText(safe(line), {
            x: marginX,
            y,
            size,
            font: bold ? fontBold : font,
          });
          y -= gap;
          line = word;
        } else {
          line = test;
        }
      }

      if (line) {
        ensureSpace(gap);
        page.drawText(safe(line), {
          x: marginX,
          y,
          size,
          font: bold ? fontBold : font,
        });
        y -= gap;
      }
    };

    // Draw a section title
    const drawSectionTitle = (title: string) => {
      if (!title) return;
      drawLine(title.toUpperCase(), { size: 11, bold: true, gap: 12 });
      ensureSpace(10);
      page.drawLine({
        start: { x: marginX, y: y + 6 },
        end: { x: marginX + 180, y: y + 6 },
        thickness: 1,
        color: rgb(0.25, 0.25, 0.25),
      });
      y -= 10;
    };

    // Helper to parse sections by name
    // Normalize items to an array so a malformed LLM section can't crash the loop.
    const getSection = (name: string) => {
      const sec = structuredResume.find(
        (s) => s?.heading?.toLowerCase() === name.toLowerCase()
      );
      if (!sec) return undefined;
      return { ...sec, items: Array.isArray(sec.items) ? sec.items : [] };
    };

    // ---------- HEADER ----------
    const headerSec = getSection("Header");
    if (headerSec && headerSec.items.length > 0) {
      const h = headerSec.items[0];

      drawLine(h.title || "", { size: 27, bold: true, gap: 28 });
      drawLine(h.subtitle || "", { size: 14,bold:true, gap: 15 });
      y -= 5;
      if (h.summary) {
          drawWrapped(h.summary, { size: 10, gap: 18 });
      }
      y -= 10;
      if (h.contact && Array.isArray(h.contact)) {
        drawWrapped(h.contact.join(" • "), { size: 10, gap: 18 });
      }
      y -= 15;
    }

    // ---------- EXPERIENCE ----------
    const expSec = getSection("Experience");
    if (expSec) {
      drawSectionTitle("Professional Experience");

      for (const job of expSec.items) {
        const header = `${job.title || ""}${
          job.subtitle ? " – " + job.subtitle : ""
        }${job.dateRange ? " (" + job.dateRange + ")" : ""}`;

        drawWrapped(header, { bold: true, gap: 16 });

        if (Array.isArray(job.bullets)) {
          for (const bullet of job.bullets) {
            drawWrapped("• " + bullet, { size: 9, gap: 14 });
          }
        }

        y -= 10;
      }
    }

    // ---------- EDUCATION ----------
    const eduSec = getSection("Education");
    if (eduSec) {
      drawSectionTitle("Education");

      for (const edu of eduSec.items) {
        const line = `${edu.title || ""}${
          edu.subtitle ? " – " + edu.subtitle : ""
        }${edu.dateRange ? " (" + edu.dateRange + ")" : ""}`;

        drawWrapped(line, { size: 9, gap: 16 });
      }

      y -= 10;
    }

    // ---------- SKILLS ----------
    const skillSec = getSection("Skills");
    if (skillSec && skillSec.items.length > 0) {
      drawSectionTitle("Skills");

      const list = skillSec.items[0].bullets || [];
      drawWrapped(list.join(" • "), { size: 9, gap: 18 });

      y -= 10;
    }

    // ---------- LANGUAGES ----------
    const langSec = getSection("Languages");
    if (langSec) {
      drawSectionTitle("Languages");

      for (const row of langSec.items) {
        for (const l of row.bullets || []) {
          drawWrapped("• " + l, { size: 9, gap: 14 });
        }
      }

      y -= 10;
    }

    // --- Export PDF ---
    const pdfBytes = await pdfDoc.save();
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=Resume-Improved.pdf",
      },
    });
  } catch (err: any) {
    console.error("❌ download-resume error:", err);
    return NextResponse.json(
      { error: "Internal Server Error", details: err.message },
      { status: 500 }
    );
  }
}
