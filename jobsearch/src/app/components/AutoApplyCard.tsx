"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Zap, Play } from "lucide-react";
import { useT } from "../lib/i18n/LanguageProvider";
import { DICT, type Key } from "../lib/i18n/dict";

// The API answers with the fixed Hebrew sentence from lib/flags; show it in the interface language.
const isStandardUnavailable = (reason?: string) => !reason || reason === DICT.he["settings.aa.unavailable"];

type Settings = { available?: boolean; reason?: string; enabled: boolean; minScore: number; dailyCap: number; hasResume: boolean; applierConfigured: boolean; stats: { today: number; total: number; needsUser: number } };
type Item = { _id: string; title: string; company: string; score: number; status: string; ats: string; note: string; createdAt: string; link: string; url: string };

const STATUS: Record<string, { key: Key; cls: string }> = {
  submitted: { key: "settings.aa.status.submitted", cls: "jm-chip jm-chip-teal" },
  submitting: { key: "settings.aa.status.submitting", cls: "jm-chip jm-chip-sky" },
  needs_user: { key: "settings.aa.status.needs_user", cls: "jm-chip jm-chip-sky" },
  failed: { key: "settings.aa.status.failed", cls: "jm-chip bg-red-50 text-red-700 border-red-200" },
  skipped: { key: "settings.aa.status.skipped", cls: "jm-chip" },
  deferred: { key: "settings.aa.status.deferred", cls: "jm-chip" },
};

/**
 * Auto-apply opt-in + activity. `showList` adds the log (Dashboard);
 * Settings and onboarding use the controls only.
 */
export default function AutoApplyCard({ showList = false, onChange }: { showList?: boolean; onChange?: (s: Settings) => void }) {
  const { t } = useT();
  const [s, setS] = useState<Settings | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    const r = await fetch("/api/settings/auto-apply");
    if (r.ok) setS(await r.json());
    if (showList) {
      const l = await fetch("/api/auto-apply");
      if (l.ok) setItems((await l.json()).items);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (patch: Partial<Settings>) => {
    if (!s) return;
    const next = { enabled: s.enabled, minScore: s.minScore, dailyCap: s.dailyCap, ...patch };
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/settings/auto-apply", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.status === 409) {
      setS({ ...s, available: false, reason: isStandardUnavailable(d?.reason) ? "" : d.reason });
      return setMsg(isStandardUnavailable(d?.reason) ? t("settings.aa.unavailable") : d.reason);
    }
    if (!r.ok) return setMsg(d?.error || t("settings.aa.saveFailed"));
    setS(d);
    onChange?.(d);
    if (patch.enabled && !s.enabled) setMsg(t("settings.aa.enabledMsg"));
  };

  const runNow = async () => {
    setBusy(true);
    await fetch("/api/auto-apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run" }) });
    setBusy(false);
    setMsg(t("settings.aa.runMsg"));
    setTimeout(load, 6000);
  };

  const dismiss = async (id: string) => {
    await fetch("/api/auto-apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dismiss", id }) });
    setItems((l) => l.filter((i) => i._id !== id));
  };

  if (!s) return <p className="jm-muted">{t("common.loading")}</p>;
  // Feature switched off server-side (FEATURE_AUTO_APPLY / no apply server): show it, but nothing can be turned on.
  const unavailable = s.available === false;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <p className="text-sm text-ink-600 leading-relaxed">
            {t("settings.aa.pitchBefore")}<span className="font-semibold text-navy">{s.minScore}%</span>{t("settings.aa.pitchAfter", { cap: s.dailyCap })}
          </p>
          {unavailable && <p className="mt-2 text-sm font-medium text-red-700">{isStandardUnavailable(s.reason) ? t("settings.aa.unavailable") : s.reason}</p>}
          {!s.hasResume && <p className="mt-2 text-sm text-red-700">{t("settings.aa.needResume")}</p>}
        </div>
        <label className="inline-flex items-center gap-3 cursor-pointer select-none">
          <span className="text-sm font-medium">{s.enabled ? t("settings.aa.on") : t("settings.aa.off")}</span>
          <button
            type="button"
            role="switch"
            aria-checked={s.enabled}
            disabled={busy || (!s.enabled && (!s.hasResume || unavailable))}
            onClick={() => save({ enabled: !s.enabled })}
            className={`relative h-7 w-12 rounded-full transition-colors ${s.enabled ? "bg-teal" : "bg-line"} disabled:opacity-50`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${s.enabled ? "start-6" : "start-1"}`} />
          </button>
        </label>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="jm-label">{t("settings.aa.minScore", { n: s.minScore })}</span>
          <input type="range" min={50} max={100} step={5} value={s.minScore} disabled={busy || unavailable} onChange={(e) => setS({ ...s, minScore: Number(e.target.value) })} onMouseUp={() => save({})} onTouchEnd={() => save({})} onKeyUp={() => save({})} className="w-full accent-teal" />
        </label>
        <label className="block">
          <span className="jm-label">{t("settings.aa.dailyCap")}</span>
          <select value={s.dailyCap} disabled={busy || unavailable} onChange={(e) => save({ dailyCap: Number(e.target.value) })} className="jm-input jm-select">
            {[1, 2, 3, 5, 8, 10, 15, 20].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="jm-chip jm-chip-teal"><Zap className="h-3 w-3" /> {t("settings.aa.today", { n: s.stats.today, cap: s.dailyCap })}</span>
        <span className="jm-chip">{t("settings.aa.total", { n: s.stats.total })}</span>
        {s.stats.needsUser > 0 && <span className="jm-chip jm-chip-sky">{t("settings.aa.waiting", { n: s.stats.needsUser })}</span>}
        {s.enabled && !unavailable && (
          <button type="button" disabled={busy} onClick={runNow} className="jm-btn jm-btn-secondary jm-btn-sm ms-auto">
            <Play className="h-4 w-4" /> {t("settings.aa.runNow")}
          </button>
        )}
      </div>
      {msg && <div className="jm-alert jm-alert-info">{msg}</div>}

      {showList && items.length > 0 && (
        <ul className="divide-y divide-line border-t border-line pt-2">
          {items.map((it) => (
            <li key={it._id} className="py-3 flex flex-wrap items-center gap-3">
              <span className={STATUS[it.status]?.cls ?? "jm-chip"}>{STATUS[it.status] ? t(STATUS[it.status].key) : it.status}</span>
              <div className="min-w-0 flex-1">
                <Link href={it.link} className="font-medium text-navy hover:underline">{it.title}</Link>
                <span className="text-ink-600"> · {it.company}</span>
                <span className="jm-muted"> · {it.score}%{it.ats ? ` · ${it.ats}` : ""}</span>
                {it.note && <p className="text-xs text-ink-600 mt-0.5" dir="auto">{it.note}</p>}
              </div>
              {it.status === "needs_user" && (
                <div className="flex gap-2">
                  {it.url && <a href={it.url} target="_blank" rel="noreferrer" className="jm-btn jm-btn-accent jm-btn-sm">{t("settings.aa.complete")}</a>}
                  <button type="button" onClick={() => dismiss(it._id)} className="jm-btn jm-btn-ghost jm-btn-sm">{t("settings.aa.dismiss")}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
