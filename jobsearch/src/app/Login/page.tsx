"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// The social-login callback's ?error= codes that have a message of their own.
const OAUTH_ERRORS = ["oauth_denied", "oauth_state", "oauth_email_unverified", "oauth_not_configured", "oauth_failed"] as const;
import { useRouter } from "next/navigation";
import Image from "next/image";
import { LogoMark } from "@/app/components/Logo";
import { mutate } from "swr";
import SocialSignIn from "@/app/components/SocialSignIn";
import { safeNextPath } from "../lib/hooks/nextPath";
import { useT } from "../lib/i18n/LanguageProvider";

function LoginForm() {
  const router = useRouter();
  const { t, dir } = useT();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [oauthError, setOauthError] = useState<(typeof OAUTH_ERRORS)[number] | "">("");
  const [loading, setLoading] = useState(false);
  // Where to go after login (`?next=`); only same-origin relative paths are honoured.
  const [next, setNext] = useState("");

  // Surface a social-login failure (callback redirects here with ?error=).
  // Read from window instead of useSearchParams to keep this page static.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const code = sp.get("error");
    if (code) setOauthError((OAUTH_ERRORS as readonly string[]).includes(code) ? (code as (typeof OAUTH_ERRORS)[number]) : "oauth_failed");
    setNext(safeNextPath(sp.get("next"), ""));
  }, []);


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOauthError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: username, password }),
      });

      const data = await res.json();
      if (res.ok) {
        // Put the fresh session into the SWR cache before navigating: the dashboard
        // pages read `/api/auth/me` from the cache first, and a stale `null` there
        // made them treat the just-signed-in user as logged out. Nothing on this
        // page subscribes to the key, so a bare revalidate would not have updated it.
        const me = await fetch("/api/auth/me", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        await mutate("/api/auth/me", me ?? undefined, { revalidate: !me }).catch(() => undefined);
        const dashboard = data.recruiter ? "/RecruiterDashboard" : data.admin ? "/AdminDashboard" : "/Dashboard";
        router.push(next && next !== "/" ? next : dashboard);
      } else {
        setError(data.message || t("pages.auth.loginFailed"));
      }
    } catch {
      setError(t("common.somethingWrong"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-2">
      {/* Mobile banner (image panel is full-height on lg) */}
      <div className="relative h-36 sm:h-44 lg:hidden overflow-hidden">
        <Image
          src="/login_image.jpg"
          alt="Singin background"
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/60 to-navy/20" />
        <p className="absolute bottom-4 inset-x-4 sm:inset-x-6 text-white text-sm sm:text-base font-medium">
          {t("auth.tagline")}
        </p>
      </div>

      {/* Form column */}
      <div className="flex flex-col px-4 sm:px-6 lg:px-12 py-6 sm:py-8 lg:py-10">
        <Link href="/" className="inline-flex items-center gap-2 w-fit" aria-label="JobMatch home">
          <LogoMark size={40} className="text-teal" title="JobMatch" />
          <span className="font-semibold text-navy text-lg">JobMatch</span>
        </Link>

        <div className="w-full max-w-md mx-auto my-auto py-8 sm:py-10 space-y-6">
          <div>
            <h1 className="jm-title">{t("auth.welcomeBack")}</h1>
            <p className="jm-subtitle">{t("auth.signInSub")}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" dir={dir}>
            <div>
              <label htmlFor="login-username" className="jm-label">{t("auth.username")}</label>
              <input
                id="login-username"
                type="text"
                className="jm-input"
                placeholder={t("auth.enterUsername")}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <label htmlFor="login-password" className="jm-label mb-0">{t("auth.password")}</label>
                <Link href="/PasswordReset" className="text-sm font-medium text-sky hover:text-sky-600">
                  {t("auth.forgot")}
                </Link>
              </div>
              <input
                id="login-password"
                type="password"
                className="jm-input"
                placeholder={t("auth.enterPassword")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {(error || oauthError) && <p className="jm-alert jm-alert-err">{error || t(`pages.oauth.${oauthError as (typeof OAUTH_ERRORS)[number]}`)}</p>}

            <button type="submit" disabled={loading} className="jm-btn jm-btn-primary w-full">
              {loading ? t("auth.signingIn") : t("auth.signIn")}
            </button>

            <p className="text-center text-sm text-ink-600">
              {t("auth.noAccount")}{" "}
              <Link href="/SignUp" className="font-semibold text-sky hover:text-sky-600">
                {t("auth.createOne")}
              </Link>
            </p>
          </form>

          <SocialSignIn next={next || "/"} />
        </div>
      </div>

      {/* Image panel (desktop) */}
      <div className="relative hidden lg:block min-h-screen overflow-hidden">
        <Image
          src="/login_image.jpg"
          alt="Singin background"
          fill
          sizes="50vw"
          className="object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/50 to-navy/10" />
        <div className="absolute bottom-0 inset-x-0 p-10 xl:p-14 text-white">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky mb-2">JobMatch</p>
          <p className="text-2xl xl:text-3xl font-semibold leading-tight max-w-md">
            {t("auth.tagline")}
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginForm;
