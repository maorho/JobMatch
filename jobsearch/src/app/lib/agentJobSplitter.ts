// src/app/lib/agentJobSplitter.ts
import OpenAI from "openai";

export type SplitResult = {
  companyDescription: string | null;
  jobDescription: string | null;
  qualifications: string[];
  prefered_qualifications: string[]; // intentionally spelled per your API
};

/** האייג'נט: קודם פרסור דטרמיניסטי, ואם חסר — LLM להשלים/לשפר */
export async function agentSplitJobText(raw: string): Promise<SplitResult> {
  const base = deterministicSplit(raw);

  const needLLM =
    (!base.companyDescription || base.companyDescription.length < 40) ||
    (!base.jobDescription || base.jobDescription.length < 40) ||
    base.qualifications.length === 0;

  if (!needLLM) return base;

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are an HR parser. Return ONLY via the provided function.\n" +
          "(1) companyDescription = about the company section only.\n" +
          "(2) jobDescription = the role overview and key responsibilities. Start at 'Position/Role Overview' if present; include responsibilities bullets; STOP before requirements.\n" +
          "(3) qualifications = MUST-have requirements only.\n" +
          "(4) prefered_qualifications = nice-to-have only; [] if none.\n" +
          "Keep original wording; no invented facts; remove duplicates.",
      },
      { role: "user", content: "Split the following job post:\n\n" + raw },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "return_sections",
          description: "Return structured sections for the job post.",
          parameters: {
            type: "object",
            properties: {
              companyDescription: { type: "string" },
              jobDescription: { type: "string" },
              qualifications: { type: "array", items: { type: "string" } },
              prefered_qualifications: { type: "array", items: { type: "string" } },
            },
            required: ["companyDescription", "jobDescription", "qualifications", "prefered_qualifications"],
            additionalProperties: false,
          },
        },
      },
    ],
    tool_choice: "auto",
  });

  let llm: SplitResult | null = null;
  const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.name === "return_sections") {
    try {
      const args = JSON.parse(toolCall.function.arguments || "{}");
      llm = {
        companyDescription: cleanText(args.companyDescription) ?? null,
        jobDescription: cleanText(args.jobDescription) ?? null,
        qualifications: asList(args.qualifications),
        prefered_qualifications: asList(args.prefered_qualifications),
      };
    } catch {
      llm = null;
    }
  }

  // מיזוג עדין: בוחר את הטוב מכל צד
  return {
    companyDescription: pickBestText(base.companyDescription, llm?.companyDescription),
    jobDescription: pickBestText(base.jobDescription, llm?.jobDescription),
    qualifications: pickBestList(base.qualifications, llm?.qualifications),
    prefered_qualifications: pickBestList(base.prefered_qualifications, llm?.prefered_qualifications),
  };
}

/* =================== Deterministic parser (improved) =================== */

function deterministicSplit(input: string): SplitResult {
  const text = normalize(input);

  // כותרות/תגיות נפוצות (כולל עברית)
  const COMPANY_LABELS = [
    "About Us", "About the Company", "Company Description", "Who we are", "Our mission", "About",
    "אודות", "על החברה", "תיאור החברה",
  ];
  const JOB_START_LABELS = [
    "Position Overview", "Role Overview", "Overview", "About the role", "About the job",
    "Role Description", "Job Overview", "Job Summary", "Summary", "Job Description",
    "Responsibilities", "Key Responsibilities", "What You’ll Be Doing", "In this position you will",
    "תיאור התפקיד", "סקירת תפקיד", "תחומי אחריות", "אחריות", "מה תעשה", "מה נעשה בתפקיד",
  ];
  const REQ_LABELS = [
    "Requirements", "Basic Qualifications", "Minimum Qualifications", "Qualifications", "Must have",
    "What you'll need", "What you bring", "דרישות", "דרישות חובה", "דרישות סף",
  ];
  const PREF_LABELS = [
    "Preferred Qualifications", "Preferred", "Nice to have", "Nice-to-have", "Good to have", "Bonus",
    "Advantages", "יתרון", "יתרונות", "ניסיון יתרון",
  ];
  const STOP_MISC = [
    "Benefits", "Compensation", "Salary", "Core Values", "Culture", "More About",
    "הטבות", "שכר", "תרבות", "ערכים", "מידע נוסף",
  ];

  // 1) גבולות דרישות/עדיפויות/סטופים — לא נחצה אותם
  const endBoundary = findFirstLabel(text, [...REQ_LABELS, ...PREF_LABELS, ...STOP_MISC]);
  const hardEnd = endBoundary ? endBoundary.index : text.length;

  // 2) נסה לאתר companyDescription בצורה מובהקת
  const companyDescription =
    sliceBetweenLabels(text, COMPANY_LABELS, [...JOB_START_LABELS, ...REQ_LABELS, ...PREF_LABELS, ...COMPANY_LABELS, ...STOP_MISC]) || null;

  // 3) jobDescription:
  //    א. אם יש כותרת Job-Start לפני הדרישות—ניקח ממנה ועד ה־hardEnd
  let jobStart = findFirstLabel(text, JOB_START_LABELS);
  let jobDesc = "";
  if (jobStart && jobStart.index < hardEnd) {
    jobDesc = text.slice(jobStart.index + jobStart.matchLength, hardEnd).trim();
  } else {
    //    ב. אין כותרת—נבחר בלוקים לפי ניקוד (job vs company) עד ה־hardEnd
    const blocks = toBlocksWithOffsets(text);
    const candidates = blocks.filter(b => b.start < hardEnd);
    const scored = candidates.map(b => ({
      ...b,
      jobScore: scoreJobBlock(b.text),
      companyScore: scoreCompanyBlock(b.text),
    }));

    // בחר רצף הבלוקים הטוב ביותר שמייצג תיאור תפקיד ולא "About Us"
    const picked: string[] = [];
    for (const b of scored) {
      // סינון בלוקים “חברתיים”
      const isCompanyish =
        b.companyScore > 0 && b.companyScore >= b.jobScore * 1.2;
      if (isCompanyish) continue;

      // חייב איזשהו סיגנל של תפקיד
      const hasJobSignal = b.jobScore > 0 || /we are looking for|you will|responsibilit|in this role|as a\b/i.test(b.text);
      if (!hasJobSignal) continue;

      picked.push(b.text.trim());
      // עצור אם פסקה זו מכילה "דרישות" או "Preferred" בטקסט עצמו
      if (containsAny(b.text, [...REQ_LABELS, ...PREF_LABELS])) break;
    }

    jobDesc = picked.join("\n\n").trim();
  }

  // 4) נקה מה־jobDescription פתיחי חברה שנשארו בטעות, ושמור אחריות אבל חתוך לפני דרישות
  jobDesc = stripLeadingCompanyLines(jobDesc);
  if (jobDesc) {
    const cut = earliestIndex(jobDesc, [...REQ_LABELS, ...PREF_LABELS, ...STOP_MISC]);
    if (cut != null) jobDesc = jobDesc.slice(0, cut).trim();
  }
  if (!jobDesc) {
    // נפילה רכה: קח 2–3 משפטים הראשונים עם סיגנל תפקיד
    const firstBlock = text.split(/\n{2,}/)[0] || "";
    const sentences = splitSentences(firstBlock)
      .filter(s => /we are looking for|you will|responsibilit|role|position/i.test(s))
      .slice(0, 3)
      .join(" ");
    jobDesc = sentences.trim();
  }
  if (!jobDesc) jobDesc = "";

  // 5) דרישות / עדיפויות
  const reqBlock = sliceBetweenLabels(text, REQ_LABELS, [...PREF_LABELS, ...STOP_MISC]) || "";
  const prefBlock = sliceBetweenLabels(text, PREF_LABELS, [...REQ_LABELS, ...STOP_MISC]) || "";

  const qualifications = splitToBullets(reqBlock);
  const prefered_qualifications = splitToBullets(prefBlock);

  return {
    companyDescription: companyDescription || null,
    jobDescription: jobDesc || null,
    qualifications,
    prefered_qualifications,
  };
}

/* =================== helpers =================== */

function normalize(s: string): string {
  return s
    .replace(/\u00A0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function labelRegex(label: string): RegExp {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|[\\s\\-–—])${esc}\\s*(?:[:：\\-–—])?\\s*(?:\\r?\\n)?\\s*`, "i");
}

function findFirstLabel(
  text: string,
  labels: string[]
): { index: number; matchLength: number; label: string } | null {
  let best: { index: number; matchLength: number; label: string } | null = null;
  for (const lbl of labels) {
    const re = labelRegex(lbl);
    const m = re.exec(text);
    if (m) {
      const cand = { index: m.index, matchLength: m[0].length, label: lbl };
      if (!best || cand.index < best.index) best = cand;
    }
  }
  return best;
}

function sliceBetweenLabels(text: string, startLabels: string[], stopLabels: string[]): string | null {
  const start = findFirstLabel(text, startLabels);
  if (!start) return null;
  const after = text.slice(start.index + start.matchLength);
  const stop = findFirstLabel(after, stopLabels);
  const out = stop ? after.slice(0, stop.index) : after;
  return out.trim() || null;
}

function containsAny(s: string, labels: string[]): boolean {
  return labels.some(lbl => labelRegex(lbl).test(s));
}

function earliestIndex(s: string, labels: string[]): number | null {
  let best: number | null = null;
  for (const lbl of labels) {
    const m = labelRegex(lbl).exec(s);
    if (m) {
      if (best == null || m.index < best) best = m.index;
    }
  }
  return best;
}

function toBlocksWithOffsets(text: string): { text: string; start: number; end: number }[] {
  const blocks: { text: string; start: number; end: number }[] = [];
  let idx = 0;
  const parts = text.split(/\n{2,}/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) { idx += part.length + 2; continue; }
    const start = text.indexOf(part, idx);
    const end = start + part.length;
    blocks.push({ text: trimmed, start, end });
    idx = end + 2;
  }
  return blocks;
}

function scoreJobBlock(s: string): number {
  const kws = [
    "we are looking for", "you will", "your role", "responsibilit", "in this role", "as a ",
    "design", "build", "implement", "develop", "debug", "deliver", "own", "lead", "collaborate",
    "position overview", "role overview", "job description", "key responsibilities",
    "תיאור התפקיד", "תחומי אחריות", "בתפקיד", "תעבוד", "אחריותך", "אחריות",
  ];
  return countMatches(s, kws);
}

function scoreCompanyBlock(s: string): number {
  const kws = [
    "about us", "about the company", "company", "our mission", "vision", "values", "culture",
    "founded", "customers", "clients", "market leader", "award", "diverse", "inclusive",
    "we have the technology", "our team", "organization", "who we are",
    "אודות", "על החברה", "חזון", "ערכים", "תרבות", "הוקמה", "לקוחות", "החברה", "הצוות שלנו",
  ];
  return countMatches(s, kws);
}

function countMatches(s: string, terms: string[]): number {
  const t = s.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const re = new RegExp(term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    const m = t.match(re);
    if (m) score += m.length;
  }
  return score;
}

function stripLeadingCompanyLines(s: string): string {
  if (!s) return s;
  const lines = s.split(/\n+/);
  const cleaned: string[] = [];
  let started = false;
  for (const line of lines) {
    const L = line.trim();
    const looksCompany =
      /about us|about the company|our mission|our values|culture|company/i.test(L) ||
      /אודות|על החברה|חזון|ערכים|תרבות|החברה/i.test(L);
    const looksJob =
      /we are looking for|you will|responsibilit|in this role|as a\b|key responsibilities|role overview|position overview/i.test(L) ||
      /תיאור התפקיד|בתפקיד|אחריות|תחומי אחריות/i.test(L);

    if (!started) {
      if (looksJob && !looksCompany) { started = true; cleaned.push(L); }
      else if (!looksCompany) { // שורה ניטרלית—אפשר להתחיל אם תבוא עוד שורה תעסוקתית
        cleaned.push(L); started = true;
      } // אחרת (שורת Company) נזרוק
    } else {
      cleaned.push(L);
    }
  }
  return cleaned.join("\n");
}

function splitToBullets(block: string): string[] {
  if (!block || !block.trim()) return [];
  let s = normalize(block);
  s = s.replace(/(?:^|\n)\s*[-–—*•·]\s*/g, "\n• ");
  s = s.replace(/·/g, "•");

  let items: string[] = [];
  if (s.includes("•")) {
    items = s
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith("•"))
      .map((l) => l.replace(/^•\s*/, "").replace(/\s+\.$/, "").trim());
  } else {
    const byLines = s.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (byLines.length > 1) {
      items = byLines;
    } else {
      items = splitSentences(s).map((x) => x.replace(/\s+\.$/, "").trim()).filter((x) => x.length > 1);
    }
  }
  return Array.from(new Set(items.filter(Boolean)));
}

function splitSentences(text: string): string[] {
  const matches = text.match(/[^.?!]+[.?!]?/g);
  if (!matches) return [text.trim()];
  return matches.map((m) => m.trim()).filter(Boolean);
}

function cleanText(s?: string | null): string | null {
  if (!s) return null;
  const t = s
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t || null;
}

function asList(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return Array.from(new Set(x.map((i) => (typeof i === "string" ? i.trim() : "")).filter(Boolean)));
}

function pickBestText(a?: string | null, b?: string | null): string | null {
  const A = a?.trim() || null;
  const B = b?.trim() || null;
  if (!A && B) return B;
  if (!B && A) return A;
  if (A && B) return B.length > A.length * 0.9 ? B : A;
  return null;
}

function pickBestList(a: string[], b?: string[]): string[] {
  const A = a || [];
  const B = b || [];
  if (A.length === 0 && B.length > 0) return B;
  if (B.length === 0 && A.length > 0) return A;
  return Array.from(new Set([...A, ...B]));
}
