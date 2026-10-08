import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { extractJson } from "@/app/lib/resume/tailor";

/**
 * Answers the extra questions an ATS form asks (country, city, LinkedIn,
 * "how did you hear about us", work authorization, years of experience…)
 * from the candidate's profile and résumé. Rules handle the standard
 * fields; the LLM handles the rest and must say "unknown" rather than guess.
 */
export type FormField = { selector: string; label: string; type: string; required: boolean; options?: string[] };
export type FormAnswer = { selector: string; value: string; source: "rule" | "llm"; confidence: number };
export type AnswerContext = {
  profile: { fullname: string; email: string; phone: string; linkedin?: string; location?: string };
  resumeText: string;
  job: { title: string; company: string };
};

export const FORM_MODEL = "gpt-4o-mini";

const pick = (options: string[] | undefined, candidates: (string | RegExp)[]): string | undefined => {
  if (!options?.length) return undefined;
  for (const c of candidates) {
    const hit = options.find((o) => (c instanceof RegExp ? c.test(o) : o.toLowerCase() === c.toLowerCase()));
    if (hit) return hit;
  }
  return undefined;
};

/** Deterministic answers for the fields every form has. */
export function ruleAnswer(field: FormField, ctx: AnswerContext): string | undefined {
  const l = field.label.toLowerCase();
  if (/linkedin/.test(l)) return ctx.profile.linkedin || undefined;
  if (/\bphone|טלפון/.test(l)) return ctx.profile.phone || undefined;
  if (/e-?mail|אימייל|דוא/.test(l)) return ctx.profile.email || undefined;
  if (/full name|^name$|שם מלא/.test(l)) return ctx.profile.fullname || undefined;
  if (/how did you hear|source|where did you (hear|find)|איך שמעת/.test(l)) return pick(field.options, [/linkedin/i, /job board/i, /other/i]) || (field.options?.length ? undefined : "LinkedIn");
  if (/privacy|consent|agree|terms|gdpr|אישור|מסכים/.test(l) && (field.type === "checkbox" || field.type === "radio")) return pick(field.options, [/yes|agree|accept|i consent/i]) || "yes";
  return undefined;
}

const llmSchema = z.object({
  answers: z.array(z.object({ selector: z.string(), value: z.string(), confidence: z.number().min(0).max(1) })),
});

export function buildFormPrompt(fields: FormField[], ctx: AnswerContext): { system: string; user: string } {
  const system = `You fill job-application form fields for a candidate, using ONLY their profile and résumé below.
Rules:
- Answer a field only when the information is in the profile/résumé or is a safe, honest default (e.g. "How did you hear about us?" → "LinkedIn"; a free-text "Anything else?" → one short sentence of genuine interest in the role).
- For a select/radio field, the value MUST be one of its options, copied exactly.
- Location/country/city: use the candidate's location from the résumé or profile; if absent, do NOT guess.
- Work authorization / visa / relocation / salary / start date / years-of-experience: answer only if the résumé makes it clear; otherwise omit the field.
- Never invent facts. Omit any field you cannot answer honestly — the candidate will fill it in themselves.
- Return STRICT JSON: {"answers": [{"selector": string, "value": string, "confidence": 0..1}]}. Nothing else.`;
  const user = `CANDIDATE: ${ctx.profile.fullname} · ${ctx.profile.email} · ${ctx.profile.phone}${ctx.profile.location ? ` · ${ctx.profile.location}` : ""}${ctx.profile.linkedin ? ` · ${ctx.profile.linkedin}` : ""}
APPLYING TO: ${ctx.job.title} at ${ctx.job.company}
RÉSUMÉ:
"""
${(ctx.resumeText || "").slice(0, 4000)}
"""
FIELDS (JSON):
${JSON.stringify(fields.map((f) => ({ selector: f.selector, label: f.label, type: f.type, required: f.required, options: f.options?.slice(0, 40) })), null, 0)}`;
  return { system, user };
}

/** A label that is really a field name (e.g. "cards[ab12][field0]") — nobody can answer what they can't read. */
export const isUnreadableLabel = (label: string) => !label.trim() || /^[\w.\-]+(\[[^\]]*\])+$/.test(label.trim()) || (!/\s/.test(label) && /[\[\]_]/.test(label));

export async function answerFormFields(fields: FormField[], ctx: AnswerContext, opts: { useLLM?: boolean } = {}): Promise<{ answers: FormAnswer[]; unanswered: FormField[] }> {
  const answers: FormAnswer[] = [];
  const open: FormField[] = [];
  for (const f of fields) {
    if (isUnreadableLabel(f.label)) continue; // never guess at a question we can't read
    const v = ruleAnswer(f, ctx);
    if (v) answers.push({ selector: f.selector, value: v, source: "rule", confidence: 1 });
    else open.push(f);
  }
  const useLLM = opts.useLLM ?? !!(process.env.OPENAI_API_KEY || process.env.NODE_ENV === "test");
  if (open.length && useLLM) {
    try {
      const { system, user } = buildFormPrompt(open, ctx);
      const llm = new ChatOpenAI({ modelName: FORM_MODEL, temperature: 0, openAIApiKey: process.env.OPENAI_API_KEY, modelKwargs: { response_format: { type: "json_object" } } });
      const res = await llm.invoke([new SystemMessage(system), new HumanMessage(user)]);
      const text = typeof res.content === "string" ? res.content : (res.content as any[]).map((p) => p?.text ?? "").join("");
      const parsed = llmSchema.safeParse(extractJson(text));
      if (parsed.success) {
        for (const a of parsed.data.answers) {
          const f = open.find((x) => x.selector === a.selector);
          if (!f || !a.value.trim() || a.confidence < 0.6) continue;
          // Options are binding: an answer outside the list is a guess.
          if (f.options?.length && !f.options.some((o) => o.toLowerCase() === a.value.trim().toLowerCase())) continue;
          answers.push({ selector: f.selector, value: a.value.trim(), source: "llm", confidence: a.confidence });
        }
      }
    } catch (e) {
      console.warn("[formAgent] LLM answering skipped:", (e as Error)?.message);
    }
  }
  const answered = new Set(answers.map((a) => a.selector));
  return { answers, unanswered: fields.filter((f) => !answered.has(f.selector)) };
}
