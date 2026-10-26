import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { extractJson } from "@/app/lib/resume/tailor";

export const OUTREACH_MODEL = "gpt-4o-mini";

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
  const lang = input.language === "he" ? "Hebrew (natural, spoken register, gender-neutral phrasing where possible)" : "English";
  const system = `You write short, warm referral requests from a job seeker to someone they are connected with on LinkedIn.
Rules:
- Language: ${lang}. ${input.channel === "linkedin" ? "A LinkedIn DM: 60–110 words, no subject." : "An email: a 4–8 word subject plus a 90–160 word body."}
- Mention the specific role and that the contact works at (or is connected to) the company. Ask for a referral or a 10-minute chat — one clear ask.
- Use ONE concrete, true detail from the sender's background that is relevant to the role. Never invent experience, mutual history, or facts about the contact.
- No flattery, no "I hope this finds you well", no emojis, no bullet lists. Sound like a person, not a template.
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
  const llm = new ChatOpenAI({ modelName: OUTREACH_MODEL, temperature: 0.5, openAIApiKey: process.env.OPENAI_API_KEY, modelKwargs: { response_format: { type: "json_object" } } });
  const res = await llm.invoke([new SystemMessage(system), new HumanMessage(user)]);
  const text = typeof res.content === "string" ? res.content : (res.content as any[]).map((p) => p?.text ?? "").join("");
  const parsed = outreachSchema.safeParse(extractJson(text));
  if (!parsed.success) throw new Error("Outreach output invalid: " + parsed.error.issues.map((i) => i.message).join("; "));
  return parsed.data;
}
