"use client";
import { useEffect, useRef, useState } from "react";
import { Upload, Users, Trash2, ExternalLink } from "lucide-react";

type Stats = { total: number; companies: number; lastImportAt: string | null };

/**
 * LinkedIn connections import (Settings + onboarding). Explains why it's
 * worth doing, how to get the file, and shows what's imported.
 */
export default function ContactsCard({ onImported, compact = false }: { onImported?: (stats: Stats) => void; compact?: boolean }) {
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
      if (!r.ok) throw new Error(d?.error || "הייבוא נכשל");
      setStats(d.stats);
      setMsg({ kind: "ok", text: `יובאו ${d.parsed.toLocaleString()} אנשי קשר (${d.imported.toLocaleString()} חדשים) מ-${d.companies.toLocaleString()} חברות.` });
      onImported?.(d.stats);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || "הייבוא נכשל" });
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
      setMsg({ kind: "ok", text: "אנשי הקשר נמחקו." });
    }
  };

  return (
    <div className="space-y-4">
      {!compact && (
        <p className="text-sm text-ink-600 leading-relaxed">
          רוב המשרות מתמלאות דרך הפניות. אם תייבא/י את אנשי הקשר שלך מלינקדאין, בכל משרה נראה לך מי מהם עובד בחברה
          וננסח בשבילך הודעת פנייה אישית לבקשת referral. הקובץ נשאר פרטי בחשבון שלך, ואפשר למחוק אותו בכל רגע.
        </p>
      )}

      {stats && stats.total > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-control bg-teal-50 border border-teal/20 px-4 py-3 text-sm">
          <Users className="h-4 w-4 text-teal-600" />
          <span className="font-medium text-teal-600">{stats.total.toLocaleString()} אנשי קשר</span>
          <span className="text-ink-600">ב-{stats.companies.toLocaleString()} חברות</span>
          {stats.lastImportAt && <span className="jm-muted">· עודכן {new Date(stats.lastImportAt).toLocaleDateString("he-IL")}</span>}
        </div>
      ) : (
        <div className="jm-alert jm-alert-info">עדיין לא יובאו אנשי קשר — מומלץ, לוקח 5 דקות.</div>
      )}

      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="jm-btn jm-btn-primary">
          <Upload className="h-4 w-4" />
          {busy ? "מייבא…" : stats?.total ? "עדכן מקובץ חדש" : "העלה Connections.csv"}
        </button>
        <button type="button" onClick={() => setShowHow((s) => !s)} className="jm-btn jm-btn-secondary">
          איך מייצאים מלינקדאין?
        </button>
        {!!stats?.total && (
          <button type="button" disabled={busy} onClick={purge} className="jm-btn jm-btn-ghost text-red-600">
            <Trash2 className="h-4 w-4" /> מחק
          </button>
        )}
      </div>

      {showHow && (
        <ol className="list-decimal ps-5 space-y-1 text-sm text-ink-600 leading-relaxed">
          <li>
            בלינקדאין: <span className="font-medium">Me → Settings &amp; Privacy → Data privacy → Get a copy of your data</span>{" "}
            <a href="https://www.linkedin.com/mypreferences/d/download-my-data" target="_blank" rel="noreferrer" className="text-sky inline-flex items-center gap-1">
              (קישור ישיר <ExternalLink className="h-3 w-3" />)
            </a>
          </li>
          <li>בוחרים “Want something in particular?” ומסמנים רק <span className="font-medium">Connections</span>.</li>
          <li>לוחצים Request archive — תוך כ-10 דקות מגיע מייל עם קובץ ZIP ובו <span className="font-mono">Connections.csv</span>.</li>
          <li>מעלים את הקובץ כאן. אפשר לחזור על זה כל כמה חודשים.</li>
        </ol>
      )}

      {msg && <div className={`jm-alert ${msg.kind === "ok" ? "jm-alert-ok" : "jm-alert-err"}`}>{msg.text}</div>}
    </div>
  );
}
