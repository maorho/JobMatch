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

  it("keeps hyperlinks hidden behind labels: link annotations are read and appended when the text doesn't show them", async () => {
    const { PDFName, PDFString } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText("Dana Dev | LinkedIn | GitHub | github.com/dana-dev", { x: 50, y: 740, size: 12, font });
    const annot = (href: string, x: number) => doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [x, 735, x + 60, 752], Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: PDFString.of(href) } }));
    page.node.set(PDFName.of("Annots"), doc.context.obj([annot("https://www.linkedin.com/in/dana-dev", 110), annot("https://github.com/dana-dev", 180), annot("mailto:dana@test.dev", 250)]));
    const { text, links } = await extractPdfText(await doc.save());
    expect(links).toEqual(["https://www.linkedin.com/in/dana-dev", "https://github.com/dana-dev", "mailto:dana@test.dev"]);
    expect(text).toContain("Links: https://www.linkedin.com/in/dana-dev | mailto:dana@test.dev"); // github.com/dana-dev is already in the text
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
