import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { extractJson } from "@/app/lib/resume/tailor";
import { chatModel } from "@/app/lib/llm/chat";
import { modelFor } from "@/app/lib/llm/models";

/** A message a real person will read, in Hebrew: the quality tier (the fast tier's Hebrew came out broken). */
export const OUTREACH_MODEL = modelFor("quality");

export type OutreachChannel = "linkedin" | "note" | "email";

export type OutreachInput = {
  me: { fullname: string; currentJob?: string; resumeSummary?: string };
  contact: { fullName: string; position?: string; company: string; connectedOn?: Date | string | null };
  job: { title: string; company: string; url?: string; description?: string };
  /** How the sender knows the contact, in their own words (optional): the opening line is built from it. */
  relationship?: string;
  /** What we know about the company (the cached research brief): products, recent news. For ONE true, specific line. */
  companyNotes?: string;
  language: "he" | "en";
  /** "linkedin" → DM; "note" → the 300-character note on a connection request; "email" → subject + longer body. */
  channel: OutreachChannel;
};

export const outreachSchema = z.object({
  subject: z.string().default(""),
  message: z.string().min(20),
  /** One line explaining the angle the message takes (shown to the user). */
  angle: z.string().default(""),
  /** 3 lines the contact can paste to a recruiter or into a referral form: who, why a fit, links. Makes "yes" cost a minute. */
  forwardNote: z.string().default(""),
});
export type Outreach = z.infer<typeof outreachSchema>;

const monthYear = (d: Date | string | null | undefined, lang: "he" | "en") => {
  const t = d ? new Date(d) : null;
  return t && !isNaN(t.getTime()) ? t.toLocaleDateString(lang === "he" ? "he-IL" : "en-US", { month: "long", year: "numeric" }) : "";
};

export function buildOutreachPrompt(input: OutreachInput): { system: string; user: string } {
  const he = input.language === "he";
  const lang = he ? "Hebrew" : "English";
  const hebrewRules = he
    ? `
HEBREW STYLE (this is how a native Israeli professional writes a LinkedIn message):
- Keep technical terms, product names, company names and job titles in English, and attach a Hebrew prefix letter with a hyphen: "ב-React", "ל-Agentic AI", "כ-Full Stack Developer", "ב-Rego Marketing". Never glue a Hebrew letter to an English word ("בReact", "לAgentic") and never split a company name.
- Only Hebrew letters in Hebrew words; no Arabic or Latin look-alikes. Do not transliterate English words into Hebrew letters ("סיסטמים", "פוזיציה") — use the Hebrew word (מערכות, משרה) or the English term.
- Spoken-professional register: short sentences, first person, no slang and no formal letter clichés. Say "תואר שני" rather than "M.Sc בהליכים". Plain words, zero fluff.
- If the sender's gender is unknown, phrase the sender's lines so they work for either (e.g. "בניתי", "עבדתי", "אשמח").
- Read the message back: every sentence must be something a person would actually say out loud.`
    : "";
  const length =
    input.channel === "note"
      ? "A LinkedIn connection-request note: at most 280 characters (LinkedIn's limit), 2–3 sentences, no subject. Say who you are, name the role, and ask to connect so you can ask a question about it; the full message comes after they accept."
      : input.channel === "linkedin"
        ? "A LinkedIn DM: 70–120 words, no subject."
        : "An email: a 4–8 word subject plus a 100–160 word body.";
  const connected = monthYear(input.contact.connectedOn, input.language);
  // The connection date is context for you, never a sentence in the message ("we've been connected since…" reads as generated).
  const opening = input.relationship?.trim()
    ? `OPENING: the sender says this about how they know the contact: "${input.relationship.trim().slice(0, 300)}". Open with that, in one natural sentence — it is the reason the contact should read on.`
    : "OPENING: a message to a LinkedIn connection the sender does not really know; do not pretend to know them, invent a mutual contact or a post you saw, and never mention when or that you connected. Open with the greeting and go straight to the role.";
  const system = `You write short, warm referral requests from a job seeker to someone they are connected with on LinkedIn.
Rules:
- Language: ${lang}. ${length}
- ${opening}
- Structure${input.channel === "note" ? " (compressed to fit)" : ""}: the opening → the role and ONE specific reason it fits the sender → the sender's single strongest, true, relevant credential → the ask.
- The credential: pick from the sender's background the one thing most relevant to THIS role — prefer a shipped project or system the sender built (with its link when the background gives one) over job titles or dates. State it as a fact, not a boast. Proof beats claims: a live link, a repo, or one real figure from the background text. No numbers, metrics or claims that are not in the background text.
- Show you understood the role, in one sentence: name the core problem the ROLE SUMMARY describes (who the users are, what makes it hard) and tie it to something the sender actually did. Never "sounds interesting" — that is what every other candidate writes.${input.companyNotes ? `
- Personalise with ONE specific, true item from COMPANY NOTES (a product, a recent announcement) only when it fits the role naturally; otherwise leave it out. Never invent news or facts about the company or the contact's team.` : ""}
- The ask, two sentences: first a short 10-minute chat to hear about the team and the day-to-day at ${input.job.company}; then an easy way out — if they are busy, the sender can simply send a CV for a referral, if it seems a fit. The second sentence is a courtesy that makes "yes" cheap, not a second demand. Then${input.job.url ? " the job link given below, so they need not search for it" : " offer to send the CV"}.
- Speak well of the role and the company; never phrase the sender's interest as a criticism of how others work.
- Never invent experience, mutual history, or facts about the contact. One ask, not a list of options.
- No flattery, no "I hope this finds you well", no emojis, no bullet lists. Sound like a person, not a template.${hebrewRules}
- Also write "forwardNote": 3 short lines in ${lang}, in the THIRD person, that the contact can paste to a recruiter or into a referral form with no editing: line 1 who the sender is (name, current role, one credential), line 2 why they fit this role, line 3 "קורות חיים: [קישור]" / "CV: [link]" plus the sender's project or profile link when the background gives one. Placeholders in square brackets for anything you do not have.
- Return STRICT JSON: {"subject": string, "message": string, "angle": string, "forwardNote": string}. Nothing else.`;
  const user = `SENDER: ${input.me.fullname}${input.me.currentJob ? ` — ${input.me.currentJob}` : ""}
SENDER BACKGROUND (résumé text; the only source of facts about the sender): ${(input.me.resumeSummary || "").slice(0, 3000) || "(none)"}
CONTACT: ${input.contact.fullName}${input.contact.position ? `, ${input.contact.position}` : ""} at ${input.contact.company}${connected ? ` (LinkedIn connection since ${connected})` : ""}
${input.relationship?.trim() ? `HOW THE SENDER KNOWS THE CONTACT: ${input.relationship.trim().slice(0, 300)}\n` : ""}ROLE: ${input.job.title} at ${input.job.company}${input.job.url ? ` — link: ${input.job.url}` : ""}
ROLE SUMMARY: ${(input.job.description || "").slice(0, 1200) || "(none)"}${input.companyNotes ? `\nCOMPANY NOTES (researched; may be stale — use at most one item, and only if it fits): ${input.companyNotes.slice(0, 1200)}` : ""}`;
  return { system, user };
}

export async function composeOutreach(input: OutreachInput): Promise<Outreach> {
  const { system, user } = buildOutreachPrompt(input);
  const llm = chatModel("quality", { temperature: 0.5, json: true });
  const res = await llm.invoke([new SystemMessage(system), new HumanMessage(user)]);
  const text = typeof res.content === "string" ? res.content : (res.content as any[]).map((p) => p?.text ?? "").join("");
  const parsed = outreachSchema.safeParse(extractJson(text));
  if (!parsed.success) throw new Error("Outreach output invalid: " + parsed.error.issues.map((i) => i.message).join("; "));
  return parsed.data;
}
