"use client";
import Link from "next/link";
import { useT } from "@/app/lib/i18n/LanguageProvider";

type Props = { name: string; kind: string; cohort?: string; blurb?: string; inviteCode: string };
const KINDS = ["bootcamp", "college", "community", "other"] as const;

/** The partner landing page body (client, so it follows the interface language). */
export default function PartnerLandingView({ name, kind, cohort, blurb, inviteCode }: Props) {
  const { t, dir } = useT();
  const who = t(`admin.pl.kind.${(KINDS as readonly string[]).includes(kind) ? (kind as (typeof KINDS)[number]) : "other"}`);
  const signup = `/SignUp?ref=${encodeURIComponent(inviteCode)}`;
  const features = [
    ["🎯", t("admin.pl.f1t"), t("admin.pl.f1")],
    ["⚡", t("admin.pl.f2t"), t("admin.pl.f2")],
    ["🎙️", t("admin.pl.f3t"), t("admin.pl.f3")],
    ["🔁", t("admin.pl.f4t"), t("admin.pl.f4")],
  ];
  return (
    <div className="jm-page" dir={dir}>
      <section className="jm-hero min-h-[240px] flex">
        <div className="relative z-10 flex flex-col justify-center gap-3 p-6 sm:p-10 max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-wider text-white/70">{name} × JobMatch</div>
          <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight leading-tight">{t("admin.pl.headline", { who, name })}</h1>
          <p className="text-sm sm:text-base text-white/80">{blurb || t("admin.pl.blurb")}</p>
          <div className="flex flex-wrap gap-2">
            <Link href={signup} className="jm-btn jm-btn-accent">{t("admin.pl.join", { code: inviteCode })}</Link>
            <Link href="/interview-questions" className="jm-btn jm-btn-ghost text-white">{t("admin.pl.bank")}</Link>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-6">
        {features.map(([icon, title, text]) => (
          <div key={title} className="jm-card p-5">
            <div className="text-2xl mb-2">{icon}</div>
            <div className="font-semibold text-navy">{title}</div>
            <p className="text-sm text-ink-600 mt-1 leading-relaxed">{text}</p>
          </div>
        ))}
      </div>

      <section className="jm-card p-5 sm:p-6 mt-6 space-y-2">
        <h2 className="jm-h2">{t("admin.pl.haveAccount")}</h2>
        <p className="text-sm text-ink-600">
          {t("admin.pl.enterCode1")} <code dir="ltr" className="rounded bg-canvas px-1.5 py-0.5">{inviteCode}</code> {t("admin.pl.enterCode2", { group: `${name}${cohort ? ` (${cohort})` : ""}`, name })}
        </p>
        <Link href="/Settings#partner" className="jm-btn jm-btn-secondary jm-btn-sm">{t("admin.pl.toSettings")}</Link>
      </section>
    </div>
  );
}
