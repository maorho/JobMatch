import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";
import type { StructuredResume, ResumeSection, ResumeItem } from "./structuredToText";

/**
 * Renders a structured résumé as a clean one-column A4 PDF in the classic
 * "modern ATS" layout: centred name + contact line, short summary, blue
 * uppercase section headings, bold role/company with grey dates, bullets
 * with a hanging indent and inline **bold** keywords.
 *
 * Latin-only résumés use Helvetica (crisp, what recruiters expect); any
 * Hebrew/other script switches to the embedded DejaVu so nothing is dropped.
 */

const PAGE: [number, number] = [595.28, 841.89]; // A4
const MARGIN_X = 48;
const MARGIN_TOP = 50;
const MARGIN_BOTTOM = 46;
const BLUE = rgb(0.16, 0.42, 0.69);
const GREY = rgb(0.45, 0.45, 0.45);
const INK = rgb(0.1, 0.1, 0.1);

const SIZE = { name: 21, contact: 9.5, body: 10, heading: 10.5, item: 10.5, bullet: 9.8 };
const LEAD = { body: 13.5, bullet: 13, item: 14, contact: 13 };

/** Sections that are drawn in this order when present; anything else follows. */
const PREFERRED_ORDER = ["experience", "education", "projects", "military service", "skills", "languages"];
const INLINE_SECTIONS = new Set(["skills", "languages"]);

let fontCache: { regular: Buffer; bold: Buffer } | null = null;
function loadUnicodeFonts() {
  if (fontCache) return fontCache;
  const dir = path.join(process.cwd(), "src/app/lib/fonts");
  fontCache = { regular: fs.readFileSync(path.join(dir, "DejaVuSans.ttf")), bold: fs.readFileSync(path.join(dir, "DejaVuSans-Bold.ttf")) };
  return fontCache;
}

const isLatin1 = (s: string) => /^[\x00-\xFF–—‘’“”•…]*$/.test(s);
const nonLatinScript = (s: string) => /[֐-׿؀-ۿЀ-ӿ぀-ヿ一-鿿]/.test(s);

function allText(resume: StructuredResume): string {
  const out: string[] = [];
  for (const s of resume) {
    out.push(s.heading || "");
    for (const it of s.items ?? []) out.push(it.title || "", it.subtitle || "", it.location || "", it.dateRange || "", it.summary || "", ...(it.contact ?? []), ...(it.bullets ?? []));
  }
  return out.join(" ");
}

type Fonts = { regular: PDFFont; bold: PDFFont; unicode: boolean };
type Run = { text: string; bold: boolean };

const RTL_CHAR = /[\u0590-\u05FF\u0600-\u06FF]/;
const hasRtl = (s: string) => RTL_CHAR.test(s);

/**
 * pdf-lib draws glyphs in logical order, so Hebrew comes out mirrored. For a
 * right-to-left line we reverse the segment order and the characters inside
 * each RTL segment, keeping Latin words and numbers readable. A deliberately
 * small bidi: enough for résumés, not a full UAX#9 implementation.
 */
function visualRtl(text: string): string {
  const segs = text.match(/[\u0590-\u05FF\u0600-\u06FF][\u0590-\u05FF\u0600-\u06FF\s"'׳״\-–,.:;()]*|[^\u0590-\u05FF\u0600-\u06FF]+/g) || [text];
  const mirror: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{" };
  return segs
    .reverse()
    .map((seg) => (hasRtl(seg) ? [...seg].reverse().map((ch) => mirror[ch] ?? ch).join("") : seg))
    .join("");
}

/** Split "text with **bold** parts" into runs. */
function parseRuns(text: string, boldAll = false): Run[] {
  if (boldAll) return [{ text, bold: true }];
  const runs: Run[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index), bold: false });
    runs.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), bold: false });
  return runs.length ? runs : [{ text, bold: false }];
}

class Canvas {
  doc!: PDFDocument;
  page!: PDFPage;
  y = PAGE[1] - MARGIN_TOP;
  fonts!: Fonts;
  safe: (t: string) => string = (t) => t;
  get width() {
    return PAGE[0] - MARGIN_X * 2;
  }
  font(bold: boolean) {
    return bold ? this.fonts.bold : this.fonts.regular;
  }
  ensure(h: number) {
    if (this.y - h < MARGIN_BOTTOM) {
      this.page = this.doc.addPage(PAGE);
      this.y = PAGE[1] - MARGIN_TOP;
    }
  }
  text(x: number, t: string, size: number, bold = false, color = INK) {
    const s = this.safe(t);
    if (!s) return 0;
    this.page.drawText(s, { x, y: this.y, size, font: this.font(bold), color });
    return this.font(bold).widthOfTextAtSize(s, size);
  }
  measure(t: string, size: number, bold = false) {
    return this.font(bold).widthOfTextAtSize(this.safe(t), size);
  }

  /** Word-wrap runs into lines of at most `maxWidth`. */
  wrap(runs: Run[], size: number, maxWidth: number): Run[][] {
    const lines: Run[][] = [];
    let line: Run[] = [];
    let lineW = 0;
    const push = (r: Run) => {
      line.push(r);
      lineW += this.measure(r.text, size, r.bold);
    };
    for (const run of runs) {
      const words = run.text.split(/(\s+)/).filter((w) => w.length);
      for (const w of words) {
        const ww = this.measure(w, size, run.bold);
        if (lineW + ww > maxWidth && line.length && !/^\s+$/.test(w)) {
          lines.push(line);
          line = [];
          lineW = 0;
        }
        if (/^\s+$/.test(w) && line.length === 0) continue; // no leading spaces
        push({ text: w, bold: run.bold });
      }
    }
    if (line.length) lines.push(line);
    return lines;
  }

  paragraph(text: string, opts: { size?: number; lead?: number; x?: number; maxWidth?: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: "left" | "center" } = {}) {
    if (!text || !text.trim()) return;
    const size = opts.size ?? SIZE.body;
    const lead = opts.lead ?? LEAD.body;
    const x0 = opts.x ?? MARGIN_X;
    const maxWidth = opts.maxWidth ?? PAGE[0] - x0 - MARGIN_X;
    const rtl = hasRtl(text);
    for (const line of this.wrap(parseRuns(text, !!opts.bold), size, maxWidth)) {
      this.ensure(lead);
      const lineWidth = line.reduce((w, r) => w + this.measure(r.text, size, r.bold), 0);
      let x = opts.align === "center" ? x0 + (maxWidth - lineWidth) / 2 : rtl ? x0 + maxWidth - lineWidth : x0;
      for (const r of rtl ? [...line].reverse() : line) x += this.text(x, rtl ? visualRtl(r.text) : r.text, size, r.bold, opts.color);
      this.y -= lead;
    }
  }

  bullet(text: string) {
    const indent = 14;
    const size = SIZE.bullet;
    const rtl = hasRtl(text);
    const lines = this.wrap(parseRuns(text), size, this.width - indent);
    lines.forEach((line, i) => {
      this.ensure(LEAD.bullet);
      if (rtl) {
        const right = MARGIN_X + this.width;
        if (i === 0) this.text(right - indent + 6, "•", size, false, INK);
        const lineWidth = line.reduce((w, r) => w + this.measure(r.text, size, r.bold), 0);
        let x = right - indent - lineWidth;
        for (const r of [...line].reverse()) x += this.text(x, visualRtl(r.text), size, r.bold);
      } else {
        if (i === 0) this.text(MARGIN_X + 2, "•", size, false, INK);
        let x = MARGIN_X + indent;
        for (const r of line) x += this.text(x, r.text, size, r.bold);
      }
      this.y -= LEAD.bullet;
    });
  }

  heading(title: string) {
    this.ensure(LEAD.item * 2 + 8);
    this.y -= 7;
    if (hasRtl(title)) this.text(MARGIN_X + this.width - this.measure(title, SIZE.heading, true), visualRtl(title), SIZE.heading, true, BLUE);
    else this.text(MARGIN_X, title.toUpperCase(), SIZE.heading, true, BLUE);
    this.y -= LEAD.item + 1;
  }

  /** "Title, Subtitle | dates" — bold head, grey dates; wraps if needed. */
  itemHead(it: ResumeItem) {
    const head = [it.title, it.subtitle].filter(Boolean).join(", ");
    const meta = [it.location, it.dateRange].filter(Boolean).join(" · ");
    if (!head && !meta) return;
    this.ensure(LEAD.item);
    const headW = this.measure(head, SIZE.item, true);
    const sepW = meta ? this.measure("|", SIZE.item) + 9 : 0;
    const metaW = meta ? this.measure(meta, SIZE.body) : 0;
    if (hasRtl(head + meta)) {
      this.paragraph(meta ? `${head}  |  ${meta}` : head, { size: SIZE.item, lead: LEAD.item, bold: true });
    } else if (headW + sepW + metaW <= this.width) {
      let x = MARGIN_X + this.text(MARGIN_X, head, SIZE.item, true) + 3;
      if (meta) {
        x += this.text(x, "|", SIZE.item, false, GREY) + 6;
        this.text(x, meta, SIZE.body, false, GREY);
      }
      this.y -= LEAD.item;
    } else {
      this.paragraph(head, { size: SIZE.item, lead: LEAD.item, bold: true });
      if (meta) this.paragraph(meta, { size: SIZE.body, lead: LEAD.body, color: GREY });
    }
  }
}

function sectionKey(s: ResumeSection) {
  return String(s.heading || "").trim().toLowerCase();
}

function orderSections(resume: StructuredResume): ResumeSection[] {
  const rest = resume.filter((s) => sectionKey(s) !== "header" && Array.isArray(s.items) && s.items.length);
  const rank = (s: ResumeSection) => {
    const i = PREFERRED_ORDER.indexOf(sectionKey(s));
    return i === -1 ? PREFERRED_ORDER.length : i;
  };
  return [...rest].sort((a, b) => rank(a) - rank(b));
}

/** Compact one-line rendering for Skills / Languages style sections. */
function inlineLines(section: ResumeSection): string[] {
  const lines: string[] = [];
  for (const it of section.items ?? []) {
    const bullets = (it.bullets ?? []).map(String).filter(Boolean);
    if (it.title && bullets.length) lines.push(`**${it.title}:** ${bullets.join(", ")}`);
    else if (bullets.length) lines.push(bullets.join(bullets.every((b) => b.length < 28) ? "  •  " : "; "));
    else if (it.title) lines.push([it.title, it.subtitle].filter(Boolean).join(" – "));
    if (it.summary) lines.push(String(it.summary));
  }
  return lines;
}

export async function renderResumePdf(resume: StructuredResume, opts: { title?: string } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const everything = allText(resume);
  const needsUnicode = !isLatin1(everything) || nonLatinScript(everything);

  const c = new Canvas();
  c.doc = doc;
  c.page = doc.addPage(PAGE);
  if (needsUnicode) {
    try {
      // pdf-lib's subsetter needs its own fontkit fork (fontkit 2.x lacks encodeStream).
      const mod: any = await import("@pdf-lib/fontkit");
      doc.registerFontkit(mod.default ?? mod);
      const f = loadUnicodeFonts();
      c.fonts = { regular: await doc.embedFont(f.regular, { subset: true }), bold: await doc.embedFont(f.bold, { subset: true }), unicode: true };
    } catch (e) {
      console.error("⚠️ Unicode font load failed, falling back to Helvetica:", e);
    }
  }
  if (!c.fonts) {
    c.fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold), unicode: false };
    c.safe = (t) => (t || "").replace(/[^\x00-\xFF–—‘’“”•…]/g, "");
  }

  // ---------- Header ----------
  const header = resume.find((s) => sectionKey(s) === "header")?.items?.[0];
  const name = header?.title || opts.title || "";
  if (name) {
    c.paragraph(name, { size: SIZE.name, lead: SIZE.name + 6, bold: true, align: "center" });
  }
  if (header?.subtitle) c.paragraph(header.subtitle, { size: SIZE.item, lead: LEAD.item, color: GREY, align: "center" });
  const contact = (header?.contact ?? []).map(String).filter(Boolean);
  if (contact.length) c.paragraph(contact.join("  |  "), { size: SIZE.contact, lead: LEAD.contact, align: "center", color: INK });
  if (header?.summary) {
    c.y -= 6;
    c.paragraph(header.summary, { size: SIZE.body, lead: LEAD.body });
  }
  for (const b of header?.bullets ?? []) c.bullet(String(b));

  // ---------- Sections ----------
  for (const section of orderSections(resume)) {
    const key = sectionKey(section);
    c.heading(String(section.heading));
    if (INLINE_SECTIONS.has(key)) {
      for (const line of inlineLines(section)) c.paragraph(line, { size: SIZE.body, lead: LEAD.body });
      continue;
    }
    section.items!.forEach((it, i) => {
      c.itemHead(it);
      if (it.summary) c.paragraph(String(it.summary), { size: SIZE.body, lead: LEAD.body });
      for (const b of it.bullets ?? []) if (b) c.bullet(String(b));
      if (i < section.items!.length - 1) c.y -= 4;
    });
  }

  doc.setTitle(name ? `${name} – Resume` : "Resume");
  doc.setProducer("JobMatch ResumeAI");
  return doc.save();
}
