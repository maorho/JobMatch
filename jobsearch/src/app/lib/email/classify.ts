import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { extractJson } from "@/app/lib/resume/tailor";
import type { GmailMessage } from "./gmail";

/** The application statuses the product tracks (Candidates.status enum). */
export const APPLICATION_STATUSES = [
  "Submitted Resume",
  "HR Phone Interview",
  "Technical Interview",
  "Final Interview",
  "Recived an Offer",
  "Accepted",
  "Rejected",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const classificationSchema = z.object({
  id: z.string(),
  isJobRelated: z.boolean(),
  company: z.string().default(""),
  roleTitle: z.string().default(""),
  status: z.enum(APPLICATION_STATUSES).nullable().default(null),
  confidence: z.number().min(0).max(1).default(0),
  summary: z.string().default(""),
});
export type EmailClassification = z.infer<typeof classificationSchema>;

const BATCH = 12;

export function buildClassifyPrompt(messages: GmailMessage[]): { system: string; user: string } {
  const system = `
You read a job seeker's recent emails and extract application-status updates.
For each email decide: is it about one of the candidate's job applications (recruiter, ATS, hiring manager)? If so, which company, which role, and what is the NEW status:
${APPLICATION_STATUSES.map((s) => `- "${s}"`).join("\n")}
Guidance: confirmation of receipt → "Submitted Resume"; scheduling a first/HR/phone screen → "HR Phone Interview"; coding test / technical / home assignment → "Technical Interview"; final/onsite/CEO round → "Final Interview"; an offer → "Recived an Offer"; a rejection ("unfortunately", "decided to move forward with other candidates", "לא נוכל להמשיך") → "Rejected". Newsletters, job alerts, marketing and unrelated mail → isJobRelated=false.
Hebrew and English. Never guess a company name that is not in the email. confidence 0-1. summary: one short sentence in the email's language.
Output strict JSON: {"items":[{"id":"","isJobRelated":true,"company":"","roleTitle":"","status":"Rejected"|null,"confidence":0.9,"summary":""}]}`.trim();
  const user = JSON.stringify({
    emails: messages.map((m) => ({ id: m.id, from: m.from, subject: m.subject, date: m.date.toISOString(), text: (m.body || m.snippet).slice(0, 1500) })),
  });
  return { system, user };
}

export async function classifyEmails(messages: GmailMessage[]): Promise<EmailClassification[]> {
  const out: EmailClassification[] = [];
  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH);
    const { system, user } = buildClassifyPrompt(batch);
    const llm = new ChatOpenAI({ modelName: "gpt-4o-mini", temperature: 0, openAIApiKey: process.env.OPENAI_API_KEY, modelKwargs: { response_format: { type: "json_object" } } });
    const res = await llm.invoke([new SystemMessage(system), new HumanMessage(user)]);
    const text = typeof res.content === "string" ? res.content : (res.content as any[]).map((p) => p?.text ?? "").join("");
    const parsed = extractJson(text) as any;
    for (const it of Array.isArray(parsed?.items) ? parsed.items : []) {
      const c = classificationSchema.safeParse(it);
      if (c.success && batch.some((m) => m.id === c.data.id)) out.push(c.data);
    }
  }
  return out;
}
