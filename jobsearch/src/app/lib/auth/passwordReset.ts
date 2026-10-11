import crypto from "crypto";
import bcrypt from "bcrypt";
import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import { sendEmail, mailTransportName } from "@/app/lib/email/send";
import { siteUrl } from "@/app/lib/seo/site";

/**
 * Email-based password reset.
 *   request → a single-use token (only its sha256 is stored) valid for RESET_TTL_MIN,
 *             mailed as a link to /PasswordReset?token=…; the response never reveals
 *             whether the address exists.
 *   reset   → token + new password → bcrypt hash replaces the old one, token cleared.
 */
export const RESET_TTL_MIN = 60;
export const MIN_PASSWORD_LENGTH = 8;

export const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
export const resetLink = (token: string) => `${siteUrl()}/PasswordReset?token=${encodeURIComponent(token)}`;

export function resetEmail(name: string, link: string): { subject: string; html: string; text: string } {
  const first = (name || "").trim().split(/\s+/)[0] || "";
  const subject = "Reset your JobMatch password · איפוס סיסמה";
  const text = `Hi${first ? ` ${first}` : ""},

Someone (hopefully you) asked to reset the password of your JobMatch account.
Open this link within ${RESET_TTL_MIN} minutes to choose a new password:

${link}

If you did not ask for this, ignore this email — your password stays as it is.

— JobMatch

שלום${first ? ` ${first}` : ""}, ביקשת לאפס את הסיסמה ל-JobMatch. הקישור למעלה תקף ל-${RESET_TTL_MIN} דקות. אם לא ביקשת, התעלם/י מההודעה.`;
  const html = `<!doctype html><html><body style="margin:0;background:#f6f7fb;font-family:Inter,Arial,sans-serif;color:#15171f">
  <div style="max-width:520px;margin:32px auto;background:#fff;border:1px solid #e6e8f1;border-radius:20px;padding:32px">
    <div style="font-size:20px;font-weight:700;margin-bottom:16px">JobMatch</div>
    <p style="font-size:16px;line-height:1.6;margin:0 0 12px">Hi${first ? ` ${escapeHtml(first)}` : ""},</p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 20px">Someone (hopefully you) asked to reset the password of your JobMatch account. The link below works for <b>${RESET_TTL_MIN} minutes</b>.</p>
    <p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#2f4ad6;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">Choose a new password</a></p>
    <p style="font-size:13px;line-height:1.6;color:#545868;margin:0 0 8px">Or paste this link into your browser:<br><a href="${link}" style="color:#2f4ad6;word-break:break-all">${link}</a></p>
    <p style="font-size:13px;line-height:1.6;color:#545868;margin:16px 0 0">If you did not ask for this, ignore this email — your password stays as it is.</p>
    <hr style="border:0;border-top:1px solid #e6e8f1;margin:24px 0">
    <p dir="rtl" style="font-size:14px;line-height:1.7;color:#545868;margin:0">שלום${first ? ` ${escapeHtml(first)}` : ""}, ביקשת לאפס את הסיסמה ל-JobMatch. הקישור תקף ל-${RESET_TTL_MIN} דקות. אם לא ביקשת, התעלם/י מההודעה.</p>
  </div></body></html>`;
  return { subject, html, text };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export type RequestResult = { ok: true; sent: boolean; transport: string; /** Only in development with no transport: the link, so the flow can be tested locally. */ devLink?: string };

export async function requestPasswordReset(rawEmail: string): Promise<RequestResult> {
  await connectToDatabase();
  const email = (rawEmail || "").trim().toLowerCase();
  const transport = mailTransportName();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: true, sent: false, transport };
  const user: any = await User.findOne({ email: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } }).select("_id email fullname username");
  if (!user) return { ok: true, sent: false, transport }; // same answer as success: no account enumeration
  const token = crypto.randomBytes(32).toString("base64url");
  await User.updateOne({ _id: user._id }, { $set: { resetTokenHash: hashToken(token), resetTokenExpires: new Date(Date.now() + RESET_TTL_MIN * 60_000) } });
  const link = resetLink(token);
  const r = await sendEmail({ to: user.email, ...resetEmail(user.fullname || user.username || "", link) });
  const devLink = !r.sent && r.transport === "console" && process.env.NODE_ENV !== "production" ? link : undefined;
  return { ok: true, sent: r.sent, transport: r.transport, devLink };
}

export type ResetResult = { ok: true; email: string } | { ok: false; error: "invalid_token" | "expired" | "weak_password" };

export async function resetPassword(token: string, newPassword: string): Promise<ResetResult> {
  await connectToDatabase();
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) return { ok: false, error: "weak_password" };
  if (!token || token.length < 20) return { ok: false, error: "invalid_token" };
  const user: any = await User.findOne({ resetTokenHash: hashToken(token) }).select("_id email resetTokenExpires");
  if (!user) return { ok: false, error: "invalid_token" };
  if (!user.resetTokenExpires || new Date(user.resetTokenExpires).getTime() < Date.now()) {
    await User.updateOne({ _id: user._id }, { $unset: { resetTokenHash: 1, resetTokenExpires: 1 } });
    return { ok: false, error: "expired" };
  }
  const hashed = await bcrypt.hash(newPassword, 10);
  await User.updateOne({ _id: user._id }, { $set: { password: hashed }, $unset: { resetTokenHash: 1, resetTokenExpires: 1 } });
  return { ok: true, email: user.email };
}
