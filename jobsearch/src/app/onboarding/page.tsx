"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import { Spinner, SignInGate } from "../components/ui";
import ContactsCard from "../components/ContactsCard";
import AutoApplyCard from "../components/AutoApplyCard";
import SearchProfileCard from "../components/SearchProfileCard";
import { Check, FileText, Users, Zap, Target } from "lucide-react";
import { useT } from "../lib/i18n/LanguageProvider";
import type { Key } from "../lib/i18n/dict";

const STEPS: { key: string; title: Key; icon: typeof Target }[] = [
  { key: "target", title: "settings.ob.step.target", icon: Target },
  { key: "resume", title: "settings.ob.step.resume", icon: FileText },
  { key: "contacts", title: "settings.ob.step.contacts", icon: Users },
  { key: "auto", title: "settings.ob.step.auto", icon: Zap },
];

/** First-run flow: résumé → LinkedIn connections (recommended, optional) → auto-apply opt-in. */
export default function OnboardingPage() {
  const router = useRouter();
  const { t, dir } = useT();
  const { user, loading } = useCurrentUser();
  const [state, setState] = useState<{ hasResume: boolean; contactsStep: string; autoApply: boolean; fullname: string; hasSearchProfile: boolean } | null>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!user) return;
    fetch("/api/onboarding").then(async (r) => {
      if (!r.ok) return;
      const d = await r.json();
      setState({ hasResume: d.hasResume, contactsStep: d.onboarding?.contactsStep || "", autoApply: d.autoApply, fullname: d.fullname, hasSearchProfile: !!d.hasSearchProfile });
      setStep(!d.hasSearchProfile ? 0 : d.hasResume ? (d.onboarding?.contactsStep ? 3 : 2) : 1);
    });
  }, [user]);

  const post = (body: object) => fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const finish = async () => {
    await post({ complete: true });
    router.push("/");
  };

  if (loading) return <Spinner label={t("common.loading")} />;
  if (!user) return <SignInGate text={t("settings.ob.signIn")} next="/onboarding" />;
  if (!state) return <Spinner />;

  return (
    <div className="jm-page max-w-3xl" dir={dir}>
      <div className="text-xs font-semibold uppercase tracking-wider text-teal mb-2">{t("settings.ob.welcome")}</div>
      <h1 className="jm-title">{t("settings.ob.hi", { name: state.fullname.split(" ")[0] || "" })}</h1>
      <p className="jm-subtitle">{t("settings.ob.sub")}</p>

      <ol className="mt-6 mb-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = i < step;
          return (
            <li key={s.key} className={`flex items-center gap-2 rounded-control px-3 py-2 text-sm border ${i === step ? "border-navy bg-navy text-white" : done ? "border-teal/30 bg-teal-50 text-teal-600" : "border-line text-ink-400"}`}>
              <span className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">{done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</span>
              <span className="truncate">{t(s.title)}</span>
            </li>
          );
        })}
      </ol>

      {step === 0 && (
        <section className="jm-card p-6 space-y-4">
          <h2 className="jm-h2">{t("settings.ob.s1Title")}</h2>
          <p className="text-sm text-ink-600 leading-relaxed">{t("settings.ob.s1Text")}</p>
          <SearchProfileCard compact onSaved={() => { setState((s) => s && { ...s, hasSearchProfile: true }); setStep(1); }} />
          <div className="pt-2 border-t border-line">
            <button type="button" onClick={() => setStep(1)} className="jm-btn jm-btn-ghost">{t("settings.ob.skip")}</button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="jm-card p-6 space-y-4">
          <h2 className="jm-h2">{t("settings.ob.s2Title")}</h2>
          <p className="text-sm text-ink-600 leading-relaxed">{t("settings.ob.s2Text")}</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/ResumeAI?welcome=1&next=/onboarding" className="jm-btn jm-btn-primary">{t("settings.ob.toResumeAI")}</Link>
            {state.hasResume && <button type="button" onClick={() => setStep(2)} className="jm-btn jm-btn-secondary">{t("settings.ob.haveOne")}</button>}
            {!state.hasResume && <button type="button" onClick={() => setStep(2)} className="jm-btn jm-btn-ghost">{t("settings.ob.later")}</button>}
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="jm-card p-6 space-y-4">
          <h2 className="jm-h2">{t("settings.ob.s3Title")} <span className="jm-chip jm-chip-teal ms-2">{t("settings.ob.recommended")}</span></h2>
          <ContactsCard onImported={() => setState((s) => s && { ...s, contactsStep: "done" })} />
          <div className="flex flex-wrap gap-2 pt-2 border-t border-line">
            <button type="button" onClick={() => setStep(3)} disabled={state.contactsStep !== "done"} className="jm-btn jm-btn-primary">{t("settings.ob.continue")}</button>
            <button type="button" onClick={async () => { await post({ contactsStep: "skipped" }); setState((s) => s && { ...s, contactsStep: "skipped" }); setStep(3); }} className="jm-btn jm-btn-ghost">{t("settings.ob.skip")}</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="jm-card p-6 space-y-4">
          <h2 className="jm-h2">{t("settings.ob.s4Title")}</h2>
          <AutoApplyCard onChange={(s) => setState((st) => st && { ...st, autoApply: s.enabled })} />
          <div className="flex flex-wrap gap-2 pt-2 border-t border-line">
            <button type="button" onClick={finish} className="jm-btn jm-btn-primary">{t("settings.ob.finish")}</button>
            <button type="button" onClick={() => setStep(2)} className="jm-btn jm-btn-ghost">{t("settings.ob.back")}</button>
          </div>
        </section>
      )}
    </div>
  );
}
