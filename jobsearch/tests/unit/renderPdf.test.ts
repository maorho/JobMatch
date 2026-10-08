import { describe, it, expect } from "vitest";
import { renderResumePdf } from "@/app/lib/resume/renderPdf";
import { extractPdfText } from "@/app/lib/pdf/extractText";
import type { StructuredResume } from "@/app/lib/resume/structuredToText";

const CV: StructuredResume = [
  { heading: "Header", items: [{ title: "Maor Homri", contact: ["054-9139326", "maorhomri1@gmail.com", "linkedin.com/in/maor-homri", "github.com/maorho"], summary: "Full-stack software engineer experienced in building scalable web applications and automation-driven systems." }] },
  { heading: "Skills", items: [{ title: "Languages & Frameworks", bullets: ["TypeScript", "React", "Next.js"] }] },
  { heading: "Experience", items: [{ title: "Fullstack Developer", subtitle: "Rego Marketing", dateRange: "2026 – Present", bullets: ["Developing a web-based SEO platform, building the frontend with **React (TypeScript)** on **Next.js**, integrating **MongoDB**, and deploying on **Vercel**.", "Designing **AI automation** workflows in **n8n**, orchestrating **RAG-based agents** to analyze website content."] }] },
  { heading: "Education", items: [{ title: "B.Sc. Computer Science", subtitle: "Ben-Gurion University", dateRange: "2019 – 2023" }] },
  { heading: "Languages", items: [{ bullets: ["Hebrew – Native", "English – Proficient"] }] },
];

describe("renderResumePdf", () => {
  it("renders the CV layout: name, contact line, blue headings in order, bold-marked bullets without the asterisks", async () => {
    const bytes = await renderResumePdf(CV);
    expect(bytes.byteLength).toBeGreaterThan(1500);
    const text = (await extractPdfText(bytes)).text.replace(/\s+/g, " ");
    expect(text).toContain("Maor Homri");
    expect(text).toContain("054-9139326 | maorhomri1@gmail.com | linkedin.com/in/maor-homri | github.com/maorho");
    expect(text).toContain("Fullstack Developer, Rego Marketing | 2026 – Present");
    expect(text).toContain("Languages & Frameworks: TypeScript, React, Next.js");
    expect(text).toContain("Hebrew – Native • English – Proficient");
    expect(text).not.toContain("**"); // bold markup is rendered, not printed
    // Section order follows the CV convention regardless of input order.
    expect(text.indexOf("EXPERIENCE")).toBeLessThan(text.indexOf("EDUCATION"));
    expect(text.indexOf("EDUCATION")).toBeLessThan(text.indexOf("SKILLS"));
    expect(text.indexOf("SKILLS")).toBeLessThan(text.indexOf("LANGUAGES"));
  });

  it("falls back to the Unicode font for Hebrew content and still renders", async () => {
    const he: StructuredResume = [
      { heading: "Header", items: [{ title: "דנה כהן", contact: ["dana@test.dev"], summary: "מפתחת פרונט ג'וניור עם React." }] },
      { heading: "Experience", items: [{ title: "מפתחת", subtitle: "אקמי", dateRange: "2024 – היום", bullets: ["בניית ממשק ב-**React**"] }] },
    ];
    const bytes = await renderResumePdf(he);
    const { text } = await extractPdfText(bytes);
    expect(text).toContain("React");
    expect(text).toContain("dana@test.dev");
    expect(text).not.toContain("**");
  });

  it("spills a long résumé onto a second page instead of overflowing", async () => {
    const long: StructuredResume = [
      { heading: "Header", items: [{ title: "Long Resume" }] },
      { heading: "Experience", items: Array.from({ length: 12 }, (_, i) => ({ title: `Role ${i}`, subtitle: "Company", dateRange: "2020 – 2021", bullets: Array.from({ length: 5 }, (_, j) => `Bullet ${j} with enough words to wrap across the page width and consume vertical space on the sheet.`) })) },
    ];
    const bytes = await renderResumePdf(long);
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
  });
});
