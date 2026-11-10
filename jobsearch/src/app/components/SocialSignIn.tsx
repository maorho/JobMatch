"use client";
import useSWR from "swr";
import { FcGoogle } from "react-icons/fc";
import { FaFacebook } from "react-icons/fa";
import { useT } from "../lib/i18n/LanguageProvider";

type Provider = "google" | "facebook";
const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { providers: [] }));

/**
 * The social sign-in buttons on Login and SignUp — only for providers whose
 * keys are set on the server (Facebook, for one, needs Meta business
 * verification to go live, so it may stay off for a long while). Nothing
 * renders until the list arrives, so a button never appears and vanishes.
 */
export default function SocialSignIn({ next = "/" }: { next?: string }) {
  const { t } = useT();
  const { data } = useSWR<{ providers: Provider[] }>("/api/auth/oauth/providers", fetcher, { revalidateOnFocus: false });
  const providers = data?.providers ?? [];
  if (!providers.length) return null;
  const href = (p: Provider) => `/api/auth/oauth/${p}?next=${encodeURIComponent(next || "/")}`;
  return (
    <>
      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-line" />
        <span className="text-sm text-ink-400">{t("widgets.social.or")}</span>
        <div className="flex-1 border-t border-line" />
      </div>
      <div className={`grid gap-3 ${providers.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {providers.includes("google") && (
          <a href={href("google")} className="jm-btn jm-btn-secondary w-full">
            <FcGoogle className="h-5 w-5 shrink-0" />
            <span>{t("widgets.social.google")}</span>
          </a>
        )}
        {providers.includes("facebook") && (
          <a href={href("facebook")} className="jm-btn jm-btn-secondary w-full">
            <FaFacebook className="h-5 w-5 shrink-0 text-sky-600" />
            <span>{t("widgets.social.facebook")}</span>
          </a>
        )}
      </div>
    </>
  );
}
