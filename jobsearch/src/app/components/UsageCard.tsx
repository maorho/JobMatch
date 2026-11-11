"use client";
import { useEffect, useState } from "react";
import { useT } from "../lib/i18n/LanguageProvider";
import type { Key } from "../lib/i18n/dict";

type Usage = { plan: "free" | "pro"; newAccount: boolean; month: string; features: { key: string; used: number; limit: number | null }[] };

const LABEL: Record<string, Key> = {
  interview_session: "settings.usage.interview_session",
  voice_session: "settings.usage.voice_session",
  prep_plan: "settings.usage.prep_plan",
  tailor: "settings.usage.tailor",
  resume_build: "settings.usage.resume_build",
  resume_chat: "settings.usage.resume_chat",
  practice_grade: "settings.usage.practice_grade",
  research: "settings.usage.research",
  outreach: "settings.usage.outreach",
  question_answer: "settings.usage.question_answer",
};

/** Settings: the free plan's monthly allowance per feature and how much of it is used. */
export default function UsageCard({ className = "" }: { className?: string }) {
  const { t } = useT();
  const [usage, setUsage] = useState<Usage | null>(null);
  useEffect(() => {
    fetch("/api/me/usage")
      .then(async (r) => (r.ok ? setUsage(await r.json()) : null))
      .catch(() => null);
  }, []);
  if (!usage) return null;
  return (
    <section className={className}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="jm-h2">{t("settings.usage.title")}</h2>
        <span className={`jm-chip ${usage.plan === "pro" ? "jm-chip-teal" : "jm-chip-sky"}`}>{usage.plan === "pro" ? t("settings.usage.planPro") : t("settings.usage.planFree")}</span>
      </div>
      <p className="jm-muted text-sm mt-1">{usage.plan === "pro" ? t("settings.usage.proText") : t("settings.usage.freeText")}</p>
      {usage.newAccount && <p className="text-xs text-ink-400 mt-1">{t("settings.usage.newAccount")}</p>}
      <ul className="mt-4 space-y-2.5">
        {usage.features.map((f) => {
          const pct = f.limit ? Math.min(100, Math.round((f.used / f.limit) * 100)) : 0;
          return (
            <li key={f.key} className="text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink">{t(LABEL[f.key] || ("settings.usage.other" as Key))}</span>
                <span className="jm-muted tabular-nums" dir="ltr">{f.limit === null ? `${f.used}` : `${f.used} / ${f.limit}`}</span>
              </div>
              {f.limit !== null && (
                <div className="h-1.5 rounded-full bg-line mt-1 overflow-hidden" aria-hidden>
                  <div className={`h-full ${pct >= 100 ? "bg-red-400" : pct >= 75 ? "bg-amber-400" : "bg-teal"}`} style={{ width: `${pct}%` }} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
