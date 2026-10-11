"use client";
import { useEffect, useState } from "react";
import { Copy, KeyRound, Plug } from "lucide-react";

type Status = { hasKey: boolean; prefix: string; createdAt: string | null; endpoint: string };

/** Settings: personal API key + MCP connection snippets for Claude / ChatGPT / Cursor. */
export default function McpCard() {
  const [st, setSt] = useState<Status | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const load = () => fetch("/api/settings/api-key").then(async (r) => r.ok && setSt(await r.json()));
  useEffect(() => {
    load();
  }, []);

  const issue = async () => {
    setBusy(true);
    const r = await fetch("/api/settings/api-key", { method: "POST" });
    if (r.ok) {
      const d = await r.json();
      setKey(d.key);
      await load();
    }
    setBusy(false);
  };
  const revoke = async () => {
    setBusy(true);
    await fetch("/api/settings/api-key", { method: "DELETE" });
    setKey(null);
    await load();
    setBusy(false);
  };
  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(""), 1500);
    } catch {}
  };

  if (!st) return <p className="jm-muted">טוען…</p>;
  const shownKey = key || "jm_live_•••••••••••••••••••••••••••••••••••••••";
  const claudeCfg = JSON.stringify({ mcpServers: { jobmatch: { type: "http", url: st.endpoint, headers: { Authorization: `Bearer ${shownKey}` } } } }, null, 2);
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600 leading-relaxed">
        JobMatch הוא שרת <span className="font-medium">MCP</span>: אפשר לדבר עם הסוכנים שלך מתוך Claude, ChatGPT או Cursor — &quot;מצא לי משרות ג&apos;וניור React בתל אביב, הגש לשתיים הטובות והכן אותי לראיון&quot;. הכלים הציבוריים (חיפוש, פרטי משרה) עובדים בלי מפתח; ההתאמות, ההגשה וההכנה שלך דורשות מפתח אישי.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {st.hasKey ? <span className="jm-chip jm-chip-teal"><KeyRound className="h-3 w-3" /> מפתח פעיל {st.prefix}</span> : <span className="jm-chip">אין מפתח</span>}
        <button type="button" disabled={busy} onClick={issue} className="jm-btn jm-btn-primary jm-btn-sm">{st.hasKey ? "החלף מפתח" : "צור מפתח"}</button>
        {st.hasKey && <button type="button" disabled={busy} onClick={revoke} className="jm-btn jm-btn-ghost jm-btn-sm text-red-600">בטל מפתח</button>}
      </div>
      {key && (
        <div className="jm-alert jm-alert-ok space-y-2">
          <div className="font-medium">המפתח מוצג פעם אחת בלבד — העתק/י אותו עכשיו:</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-white/70 px-3 py-2 text-xs" dir="ltr">{key}</code>
            <button type="button" onClick={() => copy("key", key)} className="jm-btn jm-btn-secondary jm-btn-sm"><Copy className="h-4 w-4" /> {copied === "key" ? "הועתק" : "העתק"}</button>
          </div>
        </div>
      )}
      <details className="rounded-control border border-line p-3">
        <summary className="cursor-pointer text-sm font-medium text-navy inline-flex items-center gap-2"><Plug className="h-4 w-4" /> איך מחברים</summary>
        <div className="mt-3 space-y-3 text-sm text-ink-600">
          <div>
            <div className="font-medium text-navy mb-1">Claude (Desktop / Code) · Cursor — קובץ ההגדרות של ה-MCP:</div>
            <pre className="rounded-xl bg-canvas p-3 text-xs overflow-x-auto" dir="ltr">{claudeCfg}</pre>
            <button type="button" onClick={() => copy("cfg", claudeCfg)} className="jm-btn jm-btn-ghost jm-btn-sm mt-1"><Copy className="h-4 w-4" /> {copied === "cfg" ? "הועתק" : "העתק הגדרה"}</button>
          </div>
          <div>
            <div className="font-medium text-navy mb-1">ChatGPT (Connectors / Developer mode):</div>
            <p>כתובת השרת: <code dir="ltr">{st.endpoint}</code> · אימות: Bearer token = המפתח שלך.</p>
          </div>
          <p className="jm-muted">הכלים: search_jobs, get_job, similar_jobs (ציבוריים) · my_matches, apply_to_job, interview_prep, who_do_i_know, my_applications (עם מפתח). המפתח נותן גישה לחשבון שלך — שמור/י אותו כמו סיסמה.</p>
        </div>
      </details>
    </div>
  );
}
