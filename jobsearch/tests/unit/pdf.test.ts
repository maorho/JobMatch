import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractPdfText } from "@/app/lib/pdf/extractText";

async function makePdf(lines: string[], opts: { objectStreams?: boolean } = {}) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  lines.forEach((l, i) => page.drawText(l, { x: 50, y: 740 - i * 20, size: 12, font }));
  return doc.save({ useObjectStreams: opts.objectStreams ?? true });
}

describe("extractPdfText (résumé upload)", () => {
  it("reads text from a modern PDF (object streams) — the case pdf-parse broke on", async () => {
    const bytes = await makePdf(["Dana Dev - Frontend Developer", "Skills: React, TypeScript, Node.js"]);
    const { text, pages } = await extractPdfText(bytes);
    expect(pages).toBe(1);
    expect(text).toContain("Dana Dev - Frontend Developer");
    expect(text).toContain("React, TypeScript");
  });

  it("reads a classic PDF without object streams and accepts a Node Buffer", async () => {
    const bytes = await makePdf(["Second resume. Python, SQL."], { objectStreams: false });
    const { text } = await extractPdfText(Buffer.from(bytes));
    expect(text).toContain("Python, SQL");
  });

  it("returns empty text for a PDF with no text layer and rejects non-PDF bytes", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const { text } = await extractPdfText(await doc.save());
    expect(text).toBe("");
    await expect(extractPdfText(Buffer.from("not a pdf at all"))).rejects.toThrow();
  });
});
