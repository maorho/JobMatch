"use client";
import React, { Suspense, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { LogoMark } from "@/app/components/Logo";
import { useSearchParams } from "next/navigation";
import { useT } from "../lib/i18n/LanguageProvider";

const MIN_PASSWORD_LENGTH = 8;

/** Step 1: ask for the email → a reset link is mailed. */
function RequestForm() {
  const { t } = useT();
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
      setError(t("pages.reset.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div>
        <h1 className="jm-title">{t("pages.reset.title")}</h1>
        <p className="jm-subtitle">{t("pages.reset.sub")}</p>
      </div>

      {done ? (
        <div className="space-y-3">
          <p className="jm-alert jm-alert-ok">
            {t("pages.reset.sentBefore")}<b dir="ltr">{email}</b>{t("pages.reset.sentAfter")}
          </p>
          {done.devLink && (
            <div className="jm-alert jm-alert-info text-sm space-y-1">
              <div><b>{t("pages.reset.devMode")}</b> {t("pages.reset.devText")}</div>
              <a href={done.devLink} className="font-medium underline break-all" dir="ltr">{done.devLink}</a>
              <div className="jm-muted">{t("pages.reset.devHint")}</div>
            </div>
          )}
          <button type="button" onClick={() => setDone(null)} className="jm-btn jm-btn-secondary w-full">{t("pages.reset.sendAgain")}</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reset-email" className="jm-label">{t("pages.reset.email")}</label>
            <input id="reset-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="jm-input" placeholder="you@example.com" dir="ltr" />
          </div>
          {error && <p className="jm-alert jm-alert-err">{error}</p>}
          <button type="submit" disabled={busy || !email} className="jm-btn jm-btn-primary w-full">{busy ? t("pages.reset.sending") : t("pages.reset.sendLink")}</button>
        </form>
      )}
    </>
  );
}

/** Step 2 (arrived from the email link): choose the new password. */
function NewPasswordForm({ token }: { token: string }) {
  const { t } = useT();
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
    setError(j?.error === "expired" ? t("pages.reset.expired") : j?.error === "weak_password" ? t("pages.reset.weak", { n: MIN_PASSWORD_LENGTH }) : t("pages.reset.invalid"));
  };

  if (done) {
    return (
      <div className="space-y-4">
        <h1 className="jm-title">{t("pages.reset.updatedTitle")}</h1>
        <p className="jm-alert jm-alert-ok">{t("pages.reset.updatedText")}</p>
        <Link href="/Login" className="jm-btn jm-btn-primary w-full">{t("pages.reset.goSignIn")}</Link>
      </div>
    );
  }

  return (
    <>
      <div>
        <h1 className="jm-title">{t("pages.reset.chooseTitle")}</h1>
        <p className="jm-subtitle">{t("pages.reset.chooseSub", { n: MIN_PASSWORD_LENGTH })}</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="new-password" className="jm-label">{t("pages.reset.newPassword")}</label>
          <input id="new-password" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="jm-input" dir="ltr" />
        </div>
        <div>
          <label htmlFor="confirm-password" className="jm-label">{t("pages.reset.confirmPassword")}</label>
          <input id="confirm-password" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="jm-input" dir="ltr" />
          {mismatch && <p className="text-sm text-red-600 mt-1">{t("pages.reset.mismatch")}</p>}
        </div>
        {error && (
          <div className="space-y-2">
            <p className="jm-alert jm-alert-err">{error}</p>
            <Link href="/PasswordReset" className="jm-btn jm-btn-secondary w-full">{t("pages.reset.requestNew")}</Link>
          </div>
        )}
        <button type="submit" disabled={busy || password.length < MIN_PASSWORD_LENGTH || mismatch} className="jm-btn jm-btn-primary w-full">{busy ? t("pages.reset.saving") : t("pages.reset.save")}</button>
      </form>
    </>
  );
}

function PasswordResetInner() {
  const { t, dir } = useT();
  const token = useSearchParams().get("token") || "";
  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-2">
      {/* Mobile banner (image panel is full-height on lg) */}
      <div className="relative h-36 sm:h-44 lg:hidden overflow-hidden">
        <Image src="/login_image.jpg" alt={t("pages.reset.bgAlt")} fill sizes="100vw" className="object-cover" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/60 to-navy/20" />
        <p className="absolute bottom-4 inset-x-4 sm:inset-x-6 text-white text-sm sm:text-base font-medium" dir={dir}>{t("pages.reset.tagline")}</p>
      </div>

      {/* Form column */}
      <div className="flex flex-col px-4 sm:px-6 lg:px-12 py-6 sm:py-8 lg:py-10" dir={dir}>
        <Link href="/" className="inline-flex items-center gap-2 w-fit" aria-label={t("nav.home")}>
          <LogoMark size={40} className="text-teal" title="JobMatch" />
          <span className="font-semibold text-navy text-lg">JobMatch</span>
        </Link>

        <div className="w-full max-w-md mx-auto my-auto py-8 sm:py-10 space-y-6">
          {token ? <NewPasswordForm token={token} /> : <RequestForm />}
          <p className="text-center text-sm text-ink-600">
            {t("pages.reset.remembered")}{" "}
            <Link href="/Login" className="font-semibold text-sky hover:text-sky-600">{t("pages.reset.backToSignIn")}</Link>
          </p>
        </div>
      </div>

      {/* Image panel (desktop) */}
      <div className="relative hidden lg:block min-h-screen overflow-hidden">
        <Image src="/login_image.jpg" alt={t("pages.reset.bgAlt")} fill sizes="50vw" className="object-cover" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/50 to-navy/10" />
        <div className="absolute bottom-0 inset-x-0 p-10 xl:p-14 text-white" dir={dir}>
          <p className="text-xs font-semibold uppercase tracking-wider text-sky mb-2">JobMatch</p>
          <p className="text-2xl xl:text-3xl font-semibold leading-tight max-w-md">{t("pages.reset.tagline")}</p>
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
