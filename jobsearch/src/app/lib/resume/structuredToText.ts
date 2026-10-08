/**
 * Flatten the structured résumé (the JSON buildResume/tailor produce) into
 * plain text — the form the Matcher embeds and the LLM reads back.
 */
export type ResumeItem = {
  title?: string;
  subtitle?: string;
  location?: string;
  dateRange?: string;
  contact?: string[];
  summary?: string;
  bullets?: string[];
};
export type ResumeSection = { heading?: string; items?: ResumeItem[] };
export type StructuredResume = ResumeSection[];

export function structuredToText(resume: unknown): string {
  if (!Array.isArray(resume)) return "";
  const lines: string[] = [];
  for (const section of resume as ResumeSection[]) {
    if (!section || typeof section !== "object") continue;
    if (section.heading) lines.push(String(section.heading).toUpperCase());
    for (const it of section.items ?? []) {
      if (!it || typeof it !== "object") continue;
      const head = [it.title, it.subtitle].filter(Boolean).join(" — ");
      const meta = [it.location, it.dateRange].filter(Boolean).join(" · ");
      if (head) lines.push(meta ? `${head} (${meta})` : head);
      if (it.summary) lines.push(String(it.summary));
      if (Array.isArray(it.contact) && it.contact.length) lines.push(it.contact.join(" | "));
      for (const b of it.bullets ?? []) if (b) lines.push(`• ${b}`);
    }
    lines.push("");
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** True when the value looks like a usable structured résumé. */
export function isStructuredResume(v: unknown): v is StructuredResume {
  return Array.isArray(v) && v.length > 0 && v.every((s) => s && typeof s === "object" && Array.isArray((s as ResumeSection).items));
}
