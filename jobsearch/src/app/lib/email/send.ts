import nodemailer from "nodemailer";

/**
 * Outbound email (password reset, and anything transactional later).
 * Picks the first configured transport:
 *   1. RESEND_API_KEY            → Resend HTTP API (no SMTP needed)
 *   2. SMTP_HOST + SMTP_USER/PASS → SMTP via nodemailer (Gmail: smtp.gmail.com:465 with an App Password)
 *   3. nothing configured         → "console": logs the message; in development the caller may surface the link
 * EMAIL_FROM sets the sender ("JobMatch <no-reply@yourdomain>").
 */
export type Mail = { to: string; subject: string; html: string; text: string };
export type MailResult = { sent: boolean; transport: "resend" | "smtp" | "console" | "custom"; id?: string; error?: string };
export type MailTransport = (mail: Mail & { from: string }) => Promise<{ id?: string }>;

let override: MailTransport | null = null;
/** Tests (and other callers) can swap the transport. Pass null to restore. */
export function setMailTransport(t: MailTransport | null) {
  override = t;
}

/** Sender: EMAIL_FROM, else the contact form's CONTACT_FROM_EMAIL, else Resend's sandbox sender / the SMTP user. */
export const emailFrom = () => process.env.EMAIL_FROM || process.env.CONTACT_FROM_EMAIL || (process.env.RESEND_API_KEY ? "JobMatch <onboarding@resend.dev>" : process.env.SMTP_USER ? `JobMatch <${process.env.SMTP_USER}>` : "JobMatch <no-reply@jobmatch.local>");

export function mailTransportName(): MailResult["transport"] {
  if (override) return "custom";
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return "smtp";
  return "console";
}

const RESEND_TIMEOUT_MS = 15_000;

async function resendOnce(mail: Mail & { from: string }): Promise<{ id?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), RESEND_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: mail.from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const err: any = new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
      err.retryable = res.status >= 500 || res.status === 429;
      throw err;
    }
    const j: any = await res.json().catch(() => ({}));
    return { id: j.id };
  } catch (e: any) {
    if (e?.name === "AbortError") {
      const err: any = new Error(`Resend timed out after ${RESEND_TIMEOUT_MS / 1000}s`);
      err.retryable = true;
      throw err;
    }
    if (e?.retryable === undefined) e.retryable = true; // network error
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Resend over HTTP with a hard timeout and one retry on a transient failure (never on a 4xx). */
async function viaResend(mail: Mail & { from: string }): Promise<{ id?: string }> {
  if (!process.env.EMAIL_FROM) {
    // Sandbox senders only deliver to the account owner: in production this is a silent black hole.
    console.error(`[email] EMAIL_FROM is not set — sending "${mail.subject}" to ${mail.to} from the fallback sender "${mail.from}"; set EMAIL_FROM to a verified Resend domain`);
  }
  try {
    return await resendOnce(mail);
  } catch (e: any) {
    if (!e?.retryable) throw e;
    console.warn(`[email] Resend failed once (${e?.message}); retrying`);
    return resendOnce(mail);
  }
}

async function viaSmtp(mail: Mail & { from: string }): Promise<{ id?: string }> {
  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const info = await transporter.sendMail({ from: mail.from, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text });
  return { id: info.messageId };
}

export async function sendEmail(mail: Mail): Promise<MailResult> {
  const from = emailFrom();
  const transport = mailTransportName();
  try {
    if (override) return { sent: true, transport: "custom", ...(await override({ ...mail, from })) };
    if (transport === "resend") return { sent: true, transport, ...(await viaResend({ ...mail, from })) };
    if (transport === "smtp") return { sent: true, transport, ...(await viaSmtp({ ...mail, from })) };
    // No transport configured: say so loudly in the server log so a developer sees the link.
    console.warn(`[email] no transport configured (set RESEND_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS). Would send to ${mail.to}: "${mail.subject}"\n${mail.text}`);
    return { sent: false, transport: "console" };
  } catch (e) {
    const error = (e as Error)?.message || String(e);
    console.error(`[email] ${transport} failed for ${mail.to}:`, error);
    return { sent: false, transport, error };
  }
}
