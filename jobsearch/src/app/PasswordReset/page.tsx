"use client";
import React, { Suspense, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { LogoMark } from "@/app/components/Logo";
import { useSearchParams } from "next/navigation";

const MIN_PASSWORD_LENGTH = 8;

/** Step 1: ask for the email → a reset link is mailed. */
function RequestForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ sent: boolean; transport: string; devLink?: string } | null>(null);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/password/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || "failed");
      setDone(j);
    } catch {
      setError("Something went wrong. Please try again in a minute.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div>
        <h1 className="jm-title">Password Reset</h1>
        <p className="jm-subtitle">Enter the email address on your account and we&apos;ll send you a link to choose a new password.</p>
      </div>

      {done ? (
        <div className="space-y-3">
          <p className="jm-alert jm-alert-ok">
            If an account exists for <b>{email}</b>, a reset link is on its way. It works for 60 minutes. Check your spam folder too.
          </p>
          {done.devLink && (
            <div className="jm-alert jm-alert-info text-sm space-y-1">
              <div><b>Development mode:</b> no email transport is configured, so here is the link that would have been emailed:</div>
              <a href={done.devLink} className="font-medium underline break-all">{done.devLink}</a>
              <div className="jm-muted">Set RESEND_API_KEY or SMTP_HOST / SMTP_USER / SMTP_PASS to send real emails.</div>
            </div>
          )}
          <button type="button" onClick={() => setDone(null)} className="jm-btn jm-btn-secondary w-full">Send again</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reset-email" className="jm-label">Email</label>
            <input id="reset-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="jm-input" placeholder="you@example.com" />
          </div>
          {error && <p className="jm-alert jm-alert-err">{error}</p>}
          <button type="submit" disabled={busy || !email} className="jm-btn jm-btn-primary w-full">{busy ? "Sending…" : "Send reset link"}</button>
        </form>
      )}
    </>
  );
}

/** Step 2 (arrived from the email link): choose the new password. */
function NewPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const mismatch = confirm.length > 0 && confirm !== password;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH || mismatch) return;
    setBusy(true);
    setError("");
    const r = await fetch("/api/auth/password/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
    const j = await r.json().catch(() => null);
    setBusy(false);
    if (r.ok && j?.ok) return setDone(true);
    setError(j?.error === "expired" ? "This link has expired. Request a new one below." : j?.error === "weak_password" ? `Use at least ${MIN_PASSWORD_LENGTH} characters.` : "This link is not valid any more. Request a new one below.");
  };

  if (done) {
    return (
      <div className="space-y-4">
        <h1 className="jm-title">Password updated</h1>
        <p className="jm-alert jm-alert-ok">You can sign in with your new password now.</p>
        <Link href="/Login" className="jm-btn jm-btn-primary w-full">Go to Sign In</Link>
      </div>
    );
  }

  return (
    <>
      <div>
        <h1 className="jm-title">Choose a new password</h1>
        <p className="jm-subtitle">At least {MIN_PASSWORD_LENGTH} characters. The link you used works once.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="new-password" className="jm-label">New password</label>
          <input id="new-password" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="jm-input" />
        </div>
        <div>
          <label htmlFor="confirm-password" className="jm-label">Confirm password</label>
          <input id="confirm-password" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="jm-input" />
          {mismatch && <p className="text-sm text-red-600 mt-1">The passwords don&apos;t match.</p>}
        </div>
        {error && (
          <div className="space-y-2">
            <p className="jm-alert jm-alert-err">{error}</p>
            <Link href="/PasswordReset" className="jm-btn jm-btn-secondary w-full">Request a new link</Link>
          </div>
        )}
        <button type="submit" disabled={busy || password.length < MIN_PASSWORD_LENGTH || mismatch} className="jm-btn jm-btn-primary w-full">{busy ? "Saving…" : "Save new password"}</button>
      </form>
    </>
  );
}

function PasswordResetInner() {
  const token = useSearchParams().get("token") || "";
  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-2">
      {/* Mobile banner (image panel is full-height on lg) */}
      <div className="relative h-36 sm:h-44 lg:hidden overflow-hidden">
        <Image src="/login_image.jpg" alt="Password reset background" fill sizes="100vw" className="object-cover" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/60 to-navy/20" />
        <p className="absolute bottom-4 inset-x-4 sm:inset-x-6 text-white text-sm sm:text-base font-medium">Get back to your next opportunity.</p>
      </div>

      {/* Form column */}
      <div className="flex flex-col px-4 sm:px-6 lg:px-12 py-6 sm:py-8 lg:py-10">
        <Link href="/" className="inline-flex items-center gap-2 w-fit" aria-label="JobMatch home">
          <LogoMark size={40} className="text-teal" title="JobMatch" />
          <span className="font-semibold text-navy text-lg">JobMatch</span>
        </Link>

        <div className="w-full max-w-md mx-auto my-auto py-8 sm:py-10 space-y-6">
          {token ? <NewPasswordForm token={token} /> : <RequestForm />}
          <p className="text-center text-sm text-ink-600">
            Remembered it?{" "}
            <Link href="/Login" className="font-semibold text-sky hover:text-sky-600">Back to Sign In</Link>
          </p>
        </div>
      </div>

      {/* Image panel (desktop) */}
      <div className="relative hidden lg:block min-h-screen overflow-hidden">
        <Image src="/login_image.jpg" alt="Password reset background" fill sizes="50vw" className="object-cover" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/50 to-navy/10" />
        <div className="absolute bottom-0 inset-x-0 p-10 xl:p-14 text-white">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky mb-2">JobMatch</p>
          <p className="text-2xl xl:text-3xl font-semibold leading-tight max-w-md">Get back to your next opportunity.</p>
        </div>
      </div>
    </div>
  );
}

export default function PasswordReset() {
  return (
    <Suspense fallback={null}>
      <PasswordResetInner />
    </Suspense>
  );
}
