/**
 * Extract the text of a PDF (résumés). One helper for every call site
 * (upload-resume, signup, process-my-resume).
 *
 * Uses `unpdf` — a maintained pdf.js build packaged for serverless runtimes —
 * instead of `pdf-parse`, whose bundled 2017 pdf.js failed on valid modern
 * PDFs ("Unknown compression method in flate stream" / "Invalid PDF
 * structure"), which is what broke résumé upload in ResumeAI.
 */
export async function extractPdfText(input: Buffer | ArrayBuffer | Uint8Array): Promise<{ text: string; pages: number; links: string[] }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const bytes = input instanceof Uint8Array ? new Uint8Array(input) : new Uint8Array(input as ArrayBuffer);
  const pdf = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  const merged = Array.isArray(text) ? text.join("\n") : String(text ?? "");
  let out = merged.replace(/\r/g, "").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  // Hyperlinks live in annotations, not in the text layer: a "LinkedIn" label whose URL is hidden
  // behind it would otherwise vanish from the résumé. Read them and keep the ones the text doesn't show.
  const links = await extractLinks(pdf, totalPages).catch(() => [] as string[]);
  const missing = links.filter((u) => !out.toLowerCase().includes(u.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "").toLowerCase()));
  if (missing.length) out += `\n\nLinks: ${missing.join(" | ")}`;
  return { text: out, pages: totalPages, links };
}

/** The URI link annotations of every page (http(s) and mailto), de-duplicated, in page order. */
async function extractLinks(pdf: any, pages: number): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 1; i <= Math.min(pages, 20); i++) {
    const page = await pdf.getPage(i);
    const annots: any[] = await page.getAnnotations();
    for (const a of annots) {
      const url = String(a?.url || a?.unsafeUrl || "").trim();
      if (!/^(https?:\/\/|mailto:)/i.test(url)) continue;
      const key = url.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(url.length > 300 ? url.slice(0, 300) : url);
    }
  }
  return out;
}
