import { describe, it, expect } from "vitest";
import { htmlToText } from "@/app/lib/scout/types";
import { parseDescription } from "@/app/components/DescriptionBlocks";

const HTML = `<p>Deloitte is looking for a Consultant.</p>
<h3>Key Responsibilities</h3>
<ul><li>Support client engagements across IT/Security Risk.</li><li>Perform SOC 2 testing.</li></ul>
<div><strong>Requirements:</strong></div>
<p>2–5 years in IT Risk Management.<br>Certifications (CISA, CISSP) – an advantage.</p>`;

describe("htmlToText keeps structure", () => {
  it("separates blocks, bullets and headings instead of gluing sentences", () => {
    const t = htmlToText(HTML);
    expect(t).not.toMatch(/Consultant\.Key/); // the old wall-of-text bug
    expect(t).toContain("Key Responsibilities");
    expect(t).toContain("• Support client engagements across IT/Security Risk.");
    expect(t).toContain("• Perform SOC 2 testing.");
    expect(t.split("\n").some((l) => l === "Requirements:")).toBe(true);
    expect(t).toContain("2–5 years in IT Risk Management.\nCertifications (CISA, CISSP) – an advantage.");
  });

  it("decodes entity-escaped markup (Greenhouse) once or twice", () => {
    expect(htmlToText("&lt;p&gt;Go &amp;amp; Postgres&lt;/p&gt;")).toBe("Go & Postgres");
    expect(htmlToText("<p>A &amp; B</p>")).toBe("A & B");
  });

  it("handles empty and plain text", () => {
    expect(htmlToText("")).toBe("");
    expect(htmlToText("just text")).toBe("just text");
  });
});

describe("parseDescription → blocks", () => {
  it("builds headings, lists and paragraphs, Hebrew included", () => {
    const blocks = parseDescription(htmlToText(HTML) + "\n\nדרישות התפקיד\n• ניסיון ב-React\n• אנגלית ברמה גבוהה");
    const types = blocks.map((b) => b.type);
    expect(types).toEqual(["paragraph", "heading", "list", "heading", "paragraph", "paragraph", "heading", "list"]);
    expect(blocks[2]).toMatchObject({ type: "list", items: ["Support client engagements across IT/Security Risk.", "Perform SOC 2 testing."] });
    expect(blocks[3]).toMatchObject({ type: "heading", text: "Requirements" });
    expect(blocks[7]).toMatchObject({ type: "list", items: ["ניסיון ב-React", "אנגלית ברמה גבוהה"] });
  });

  it("does not turn ordinary sentences into headings", () => {
    const blocks = parseDescription("We are hiring a developer to join our team.\nYou will build things.");
    expect(blocks.every((b) => b.type === "paragraph")).toBe(true);
  });
});

describe("list items wrapped in paragraphs (Eightfold / Microsoft)", () => {
  const EF = `<b>Qualifications</b><br><div><ul style="list-style-type: disc;"><li><p>5+ years of experience in ASIC design </p></li></ul></div><div><ul><li><p>BSc/MSc in Electrical Engineering</p></li></ul></div><ul><li></li><li></li></ul><p>Proven communication skills in English.</p>`;
  it("htmlToText keeps the marker and its text on one line and drops empty items", () => {
    const t = htmlToText(EF);
    expect(t).toContain("• 5+ years of experience in ASIC design");
    expect(t).toContain("• BSc/MSc in Electrical Engineering");
    expect(t).not.toMatch(/(^|\n)•\s*(\n|$)/);
    expect(parseDescription(t)).toEqual([
      { type: "heading", text: "Qualifications" },
      { type: "list", items: ["5+ years of experience in ASIC design", "BSc/MSc in Electrical Engineering"] },
      { type: "paragraph", text: "Proven communication skills in English." },
    ]);
  });
  it("parseDescription repairs text that was stored before the fix", () => {
    const stored = "Qualifications\n\n•\n5+ years of experience in ASIC design\n\n•\nBSc/MSc in Electrical Engineering\n\n•\n•\n\nProven communication skills in English.";
    expect(parseDescription(stored)).toEqual([
      { type: "heading", text: "Qualifications" },
      { type: "list", items: ["5+ years of experience in ASIC design", "BSc/MSc in Electrical Engineering"] },
      { type: "paragraph", text: "Proven communication skills in English." },
    ]);
  });
});
