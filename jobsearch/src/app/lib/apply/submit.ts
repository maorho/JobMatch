/**
 * Client for the Puppeteer server's form-filling endpoint (server/index.ts
 * `POST /api/apply`). The server knows the common ATS application forms
 * (Greenhouse, Lever, Comeet) and reports honestly when a form needs a
 * human (custom required questions, captcha, unknown layout).
 */
export type ApplyProfile = { firstName: string; lastName: string; email: string; phone: string; linkedin?: string };

export type FormFieldInfo = { selector: string; label: string; type: string; required: boolean; options?: string[] };

export type SubmitResult = {
  /** `ready` only comes back from a dry run: the form is filled and nothing required is missing. */
  status: "submitted" | "needs_user" | "failed" | "ready";
  ats: string;
  /** "agent" when the computer-use style agent handled the form. */
  mode?: string;
  steps?: { step: number; url: string; thought: string; status: string; applied: string[] }[];
  reason?: string;
  /** Text seen on the confirmation page, when submitted. */
  confirmation?: string;
  /** What the form still asks for (needs_user / ready). */
  fields?: FormFieldInfo[];
  missing?: string[];
  captchaPresent?: boolean;
};

export type SubmitInput = {
  url: string;
  profile: ApplyProfile;
  resumePdf: Uint8Array;
  resumeFileName?: string;
  coverNote?: string;
  /** Fill everything, report the remaining fields, never press submit. */
  dryRun?: boolean;
  /** Answers for fields a previous dry run reported. */
  answers?: { selector: string; value: string }[];
  /** Context for the form agent (unknown/multi-step ATS): the résumé it may quote, and the posting. */
  resumeText?: string;
  jobTitle?: string;
  company?: string;
};

export async function submitExternalApplication(input: SubmitInput): Promise<SubmitResult> {
  const base = process.env.PUPPETEER_SERVER_URL || "http://localhost:4000";
  const token = process.env.SCRAPER_TOKEN || process.env.CRON_SECRET || "";
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(`${base}/api/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { "x-scraper-token": token } : {}) },
      body: JSON.stringify({
        url: input.url,
        profile: input.profile,
        coverNote: input.coverNote || "",
        resumeFileName: input.resumeFileName || "CV.pdf",
        resumePdfBase64: Buffer.from(input.resumePdf).toString("base64"),
        dryRun: !!input.dryRun,
        answers: input.answers || [],
        resumeText: (input.resumeText || "").slice(0, 4000),
        jobTitle: input.jobTitle,
        company: input.company,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) return { status: "failed", ats: data?.ats || "", reason: data?.error || `apply server returned ${res.status}` };
    const status = ["submitted", "needs_user", "ready"].includes(data?.status) ? data.status : "failed";
    return { status, ats: data?.ats || "", mode: data?.mode, steps: data?.steps, reason: data?.reason, confirmation: data?.confirmation, fields: data?.fields, missing: data?.missing, captchaPresent: data?.captchaPresent };
  } catch (e: any) {
    return { status: "failed", ats: "", reason: e?.name === "AbortError" ? "apply server timed out" : e?.message || "apply server unreachable" };
  } finally {
    clearTimeout(t);
  }
}

/** Split "Maor Homri" into the first/last names ATS forms want. */
export function splitName(fullname: string): { firstName: string; lastName: string } {
  const parts = (fullname || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}
