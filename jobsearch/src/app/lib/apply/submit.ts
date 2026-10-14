/**
 * Client for the Puppeteer server's form-filling endpoint (server/index.ts
 * `POST /api/apply`). The server knows the common ATS application forms
 * (Greenhouse, Lever, Comeet) and reports honestly when a form needs a
 * human (custom required questions, captcha, unknown layout).
 */
import { applyServerBase, applyServerToken } from "./server";

export type ApplyProfile = { firstName: string; lastName: string; email: string; phone: string; linkedin?: string };

export type FormFieldInfo = { selector: string; label: string; type: string; required: boolean; options?: string[] };

export type SubmitResult = {
  /** `ready` only comes back from a dry run: the form is filled and nothing required is missing. */
  status: "submitted" | "needs_user" | "failed" | "ready";
  ats: string;
  /**
   * The failure is the apply server's, not the form's (unreachable, timed
   * out, 503 Busy, 5xx, not configured): worth retrying on a later pass,
   * never a verdict on the posting.
   */
  transient?: boolean;
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

/**
 * Must exceed the server's own budget (server/index.ts: 40s page load + up to
 * 150s of form agent + submit waits), otherwise a slow-but-successful submit
 * is reported as a timeout and the user is told to check their inbox for nothing.
 */
export const APPLY_CLIENT_TIMEOUT_MS = 210_000;

export async function submitExternalApplication(input: SubmitInput): Promise<SubmitResult> {
  const base = applyServerBase();
  if (!base) return { status: "failed", ats: "", transient: true, reason: "apply server not configured" };
  const token = applyServerToken();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), APPLY_CLIENT_TIMEOUT_MS);
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
    // 503 is the server's "Busy, try again"; any 5xx is its problem, not the form's.
    if (!res.ok) return { status: "failed", ats: data?.ats || "", transient: res.status >= 500, reason: data?.error || `apply server returned ${res.status}` };
    const status = ["submitted", "needs_user", "ready"].includes(data?.status) ? data.status : "failed";
    return { status, ats: data?.ats || "", mode: data?.mode, steps: data?.steps, reason: data?.reason, confirmation: data?.confirmation, fields: data?.fields, missing: data?.missing, captchaPresent: data?.captchaPresent };
  } catch (e: any) {
    return { status: "failed", ats: "", transient: true, reason: e?.name === "AbortError" ? "apply server timed out" : `apply server unreachable: ${e?.message || e}` };
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
