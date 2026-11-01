import { extractPdfText } from "@/app/lib/pdf/extractText";

/**
 * Text out of a file a person attaches in a chat: PDF, Word (.docx) or
 * plain text/Markdown. One place for the type check and the limits, so the
 * attachments route and anything else that reads uploads agree.
 */
export const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
export const ATTACHMENT_MAX_FILES = 3;
/** Text kept per file; a two-page résumé is ~4k characters, a long job description ~8k. */
export const ATTACHMENT_MAX_CHARS = 12_000;

/** Attached text across a whole conversation (every turn re-sends the history). */
export const ATTACHMENT_MAX_TOTAL_CHARS = 30_000;

export type AttachmentKind = "pdf" | "docx" | "text";
/** What a chat message carries per attached file once its text was extracted. */
export type ChatAttachment = { name: string; text: string };

/** The person's typed message followed by each attached file's text, clearly fenced so the model knows where it came from. */
export function withAttachments(content: string, attachments: ChatAttachment[]): string {
  if (!attachments.length) return content;
  const blocks = attachments.map((a) => `[קובץ מצורף: ${a.name}]\n"""\n${a.text}\n"""`);
  return `${(content || "").trim() || "(הודעה ללא טקסט, רק קבצים)"}\n\n${blocks.join("\n\n")}`;
}
export type ExtractedAttachment = { name: string; kind: AttachmentKind; text: string; chars: number; truncated: boolean; looksLikeResume: boolean };

const EXT: Record<string, AttachmentKind> = { pdf: "pdf", docx: "docx", txt: "text", md: "text", markdown: "text", csv: "text", rtf: "text" };
const MIME: Record<string, AttachmentKind> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "text",
  "text/markdown": "text",
  "text/csv": "text",
};

export function attachmentKind(name: string, mime?: string): AttachmentKind | null {
  const ext = name.toLowerCase().split(".").pop() || "";
  return EXT[ext] || (mime ? MIME[mime.split(";")[0].trim()] : undefined) || null;
}

/** A résumé has contact details and the usual section words; a job description or an article doesn't. */
export function looksLikeResume(text: string): boolean {
  const t = text.slice(0, 6000);
  const contact = /[\w.+-]+@[\w-]+\.[\w.]+/.test(t) || /(\+?\d[\d\s().-]{8,}\d)/.test(t);
  const sections = (t.match(/\b(experience|education|skills|summary|work history|employment)\b|ניסיון|השכלה|כישורים|מיומנויות|תעסוקתי|שירות צבאי/gi) || []).length;
  return contact && sections >= 2;
}

function cleanText(s: string): string {
  return s.replace(/\r/g, "").replace(/\u0000/g, "").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export async function extractAttachmentText(file: { name: string; type?: string; bytes: ArrayBuffer | Uint8Array }): Promise<ExtractedAttachment> {
  const kind = attachmentKind(file.name, file.type);
  if (!kind) throw Object.assign(new Error(`Unsupported file type: ${file.name}`), { code: "UNSUPPORTED" });
  const u8 = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
  let raw = "";
  if (kind === "pdf") raw = (await extractPdfText(u8)).text;
  else if (kind === "docx") {
    const mammoth = await import("mammoth");
    raw = (await mammoth.extractRawText({ buffer: Buffer.from(u8) })).value;
  } else raw = new TextDecoder("utf-8", { fatal: false }).decode(u8);
  const text = cleanText(raw);
  if (!text) throw Object.assign(new Error(`No readable text in ${file.name}`), { code: "EMPTY" });
  const truncated = text.length > ATTACHMENT_MAX_CHARS;
  const kept = truncated ? text.slice(0, ATTACHMENT_MAX_CHARS) : text;
  return { name: file.name, kind, text: kept, chars: text.length, truncated, looksLikeResume: looksLikeResume(kept) };
}
