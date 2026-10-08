"use client";

/**
 * Renders a plain-text job description as structured blocks: headings,
 * bullet lists and paragraphs. The text comes from htmlToText(), which keeps
 * one block per line and prefixes list items with "• ". Each block gets
 * dir="auto" so Hebrew sections flow right-to-left next to English ones.
 */
type Block =
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

const BULLET_RE = /^\s*(?:[•\-\*·▪◦●■]|\d+[.)])\s+/;
const HEADING_HINT_RE =
  /^(key\s+)?(responsibilities|requirements|qualifications|about( the)? (role|team|us|company|position)|what you(’|')ll do|what you will do|what we offer|benefits|nice to have|preferred|minimum qualifications|preferred qualifications|job description|description|skills|experience|education|who you are|your impact|the role|the team|why join|תיאור( ה)?משרה|דרישות( ה)?תפקיד|דרישות|תחומי אחריות|מה נדרש|יתרון|על החברה|על התפקיד|כישורים נדרשים)\s*:?\s*$/i;

function isHeading(line: string, next: string | undefined): boolean {
  if (BULLET_RE.test(line)) return false;
  if (HEADING_HINT_RE.test(line)) return true;
  if (line.endsWith(":") && line.length <= 80) return true;
  // Short title-ish line without terminal punctuation, followed by content.
  return line.length <= 60 && !/[.!?,;]$/.test(line) && !!next && /\p{L}/u.test(line) && line.split(/\s+/).length <= 7;
}

export function parseDescription(text: string): Block[] {
  const lines = (text || "").replace(/\r/g, "").split("\n").map((l) => l.trim());
  const blocks: Block[] = [];
  let list: string[] | null = null;
  const flushList = () => {
    if (list && list.length) blocks.push({ type: "list", items: list });
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) {
      // A blank line between two bullets is still the same list.
      const next = lines.slice(i + 1).find((l) => l);
      if (!(list && next && BULLET_RE.test(next))) flushList();
      continue;
    }
    if (BULLET_RE.test(line)) {
      (list ??= []).push(line.replace(BULLET_RE, "").trim());
      continue;
    }
    flushList();
    const next = lines.slice(i + 1).find((l) => l);
    if (isHeading(line, next)) blocks.push({ type: "heading", text: line.replace(/:$/, "") });
    else blocks.push({ type: "paragraph", text: line });
  }
  flushList();
  return blocks;
}

export default function DescriptionBlocks({ text, className = "" }: { text: string; className?: string }) {
  const blocks = parseDescription(text);
  if (blocks.length === 0) return null;
  return (
    <div className={`text-base space-y-3 ${className}`}>
      {blocks.map((b, i) => {
        if (b.type === "heading") {
          return (
            <h4 key={i} dir="auto" className="jm-h2 mt-6 first:mt-0">
              {b.text}
            </h4>
          );
        }
        if (b.type === "list") {
          return (
            <ul key={i} className="list-disc ps-5 space-y-1 text-ink-600 leading-relaxed marker:text-teal">
              {b.items.map((it, j) => (
                <li key={j} dir="auto" className="break-words">
                  {it}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} dir="auto" className="text-ink-600 leading-relaxed break-words">
            {b.text}
          </p>
        );
      })}
    </div>
  );
}
