import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { extractJson } from "@/app/lib/resume/tailor";
import { chatModel } from "@/app/lib/llm/chat";
import { modelFor } from "@/app/lib/llm/models";

/** A message a real person will read, in Hebrew: the quality tier (the fast tier's Hebrew came out broken). */
export const OUTREACH_MODEL = modelFor("quality");

export type OutreachInput = {
  me: { fullname: string; currentJob?: string; resumeSummary?: string };
  contact: { fullName: string; position?: string; company: string };
  job: { title: string; company: string; url?: string; description?: string };
  language: "he" | "en";
  /** "linkedin" → short DM; "email" → subject + longer body. */
  channel: "linkedin" | "email";
};

export const outreachSchema = z.object({
  subject: z.string().default(""),
  message: z.string().min(20),
  /** One line explaining the angle the message takes (shown to the user). */
  angle: z.string().default(""),
});
export type Outreach = z.infer<typeof outreachSchema>;

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
  const system = `You write short, warm referral requests from a job seeker to someone they are connected with on LinkedIn.
Rules:
- Language: ${lang}. ${input.channel === "linkedin" ? "A LinkedIn DM: 60–100 words, no subject." : "An email: a 4–8 word subject plus a 90–150 word body."}
- Structure: who I am in one line → why this role (one specific reason) → ONE concrete, true detail from the sender's background that matters for this role → one clear ask (a referral, or a 10-minute chat). Nothing else.
- Mention the specific role and that the contact works at (or is connected to) the company. Never invent experience, mutual history, or facts about the contact.
- No flattery, no "I hope this finds you well", no emojis, no bullet lists. Sound like a person, not a template.${hebrewRules}
- Return STRICT JSON: {"subject": string, "message": string, "angle": string}. Nothing else.`;
  const user = `SENDER: ${input.me.fullname}${input.me.currentJob ? ` — ${input.me.currentJob}` : ""}
SENDER BACKGROUND (summary): ${(input.me.resumeSummary || "").slice(0, 1200) || "(none)"}
CONTACT: ${input.contact.fullName}${input.contact.position ? `, ${input.contact.position}` : ""} at ${input.contact.company}
ROLE: ${input.job.title} at ${input.job.company}${input.job.url ? ` (${input.job.url})` : ""}
ROLE SUMMARY: ${(input.job.description || "").slice(0, 800) || "(none)"}`;
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
