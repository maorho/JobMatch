/**
 * Extract the text of a PDF (résumés). One helper for every call site
 * (upload-resume, signup, process-my-resume).
 *
 * Uses `unpdf` — a maintained pdf.js build packaged for serverless runtimes —
 * instead of `pdf-parse`, whose bundled 2017 pdf.js failed on valid modern
 * PDFs ("Unknown compression method in flate stream" / "Invalid PDF
 * structure"), which is what broke résumé upload in ResumeAI.
 */
export async function extractPdfText(input: Buffer | ArrayBuffer | Uint8Array): Promise<{ text: string; pages: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const bytes = input instanceof Uint8Array ? new Uint8Array(input) : new Uint8Array(input as ArrayBuffer);
  const pdf = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  const merged = Array.isArray(text) ? text.join("\n") : String(text ?? "");
  return {
    // Collapse the layout noise pdf.js leaves (runs of spaces, blank lines).
    text: merged.replace(/\r/g, "").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim(),
    pages: totalPages,
  };
}
