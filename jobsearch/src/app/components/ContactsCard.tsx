"use client";
import { useEffect, useRef, useState } from "react";
import { Upload, Users, Trash2, ExternalLink } from "lucide-react";
import { useT } from "../lib/i18n/LanguageProvider";

type Stats = { total: number; companies: number; lastImportAt: string | null };

/**
 * LinkedIn connections import (Settings + onboarding). Explains why it's
 * worth doing, how to get the file, and shows what's imported.
 */
export default function ContactsCard({ onImported, compact = false }: { onImported?: (stats: Stats) => void; compact?: boolean }) {
  const { t, lang } = useT();
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [showHow, setShowHow] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = () => fetch("/api/contacts").then(async (r) => r.ok && setStats((await r.json()).stats));
  useEffect(() => {
    load();
  }, []);

  const upload = async (file: File) => {
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/contacts", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || t("settings.ct.importFailed"));
      setStats(d.stats);
      setMsg({ kind: "ok", text: t("settings.ct.imported", { parsed: d.parsed.toLocaleString(), imported: d.imported.toLocaleString(), companies: d.companies.toLocaleString() }) });
      onImported?.(d.stats);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || t("settings.ct.importFailed") });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const purge = async () => {
    setBusy(true);
    const r = await fetch("/api/contacts", { method: "DELETE" });
    setBusy(false);
    if (r.ok) {
      setStats({ total: 0, companies: 0, lastImportAt: null });
      setMsg({ kind: "ok", text: t("settings.ct.purged") });
    }
  };

  return (
    <div className="space-y-4">
      {!compact && <p className="text-sm text-ink-600 leading-relaxed">{t("settings.ct.intro")}</p>}

      {stats && stats.total > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-control bg-teal-50 border border-teal/20 px-4 py-3 text-sm">
          <Users className="h-4 w-4 text-teal-600" />
          <span className="font-medium text-teal-600">{t("settings.ct.count", { n: stats.total.toLocaleString() })}</span>
          <span className="text-ink-600">{t("settings.ct.inCompanies", { n: stats.companies.toLocaleString() })}</span>
          {stats.lastImportAt && <span className="jm-muted">{t("settings.ct.updated", { date: new Date(stats.lastImportAt).toLocaleDateString(lang === "he" ? "he-IL" : "en-GB") })}</span>}
        </div>
      ) : (
        <div className="jm-alert jm-alert-info">{t("settings.ct.none")}</div>
      )}

      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="jm-btn jm-btn-primary">
          <Upload className="h-4 w-4" />
          {busy ? t("settings.ct.importing") : stats?.total ? t("settings.ct.updateFile") : t("settings.ct.upload")}
        </button>
        <button type="button" onClick={() => setShowHow((s) => !s)} className="jm-btn jm-btn-secondary">
          {t("settings.ct.howExport")}
        </button>
        {!!stats?.total && (
          <button type="button" disabled={busy} onClick={purge} className="jm-btn jm-btn-ghost text-red-600">
            <Trash2 className="h-4 w-4" /> {t("settings.ct.delete")}
          </button>
        )}
      </div>

      {showHow && (
        <ol className="list-decimal ps-5 space-y-1 text-sm text-ink-600 leading-relaxed">
          <li>
            {t("settings.ct.how1")}<span className="font-medium">Me → Settings &amp; Privacy → Data privacy → Get a copy of your data</span>{" "}
            <a href="https://www.linkedin.com/mypreferences/d/download-my-data" target="_blank" rel="noreferrer" className="text-sky inline-flex items-center gap-1">
              {t("settings.ct.how1Link")} <ExternalLink className="h-3 w-3" />)
            </a>
          </li>
          <li>{t("settings.ct.how2")}<span className="font-medium">Connections</span>.</li>
          <li>{t("settings.ct.how3")}<span className="font-mono">Connections.csv</span>.</li>
          <li>{t("settings.ct.how4")}</li>
        </ol>
      )}

      {msg && <div className={`jm-alert ${msg.kind === "ok" ? "jm-alert-ok" : "jm-alert-err"}`}>{msg.text}</div>}
    </div>
  );
}
