"use client";
import { useState } from "react";
import useSWR from "swr";
import { MessageCircle, Send, Check, Copy } from "lucide-react";

type Link = { id: string; label: string; linkedAt: string } | null;
type Data = { whatsapp: Link; telegram: Link; prefs: { matches: boolean; updates: boolean }; code: string; configured: { whatsapp: boolean; telegram: boolean }; whatsappNumber: string; telegramBot: string };
const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));

/** Settings: get matches and updates on WhatsApp / Telegram. Linking is done from the person's own phone with a short code. */
export default function ChannelsCard() {
  const { data, mutate } = useSWR<Data>("/api/settings/channels", fetcher, { refreshInterval: 5000 });
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState(false);
  const [testResult, setTestResult] = useState<string>("");
  if (!data) return <p className="jm-muted">טוען…</p>;

  const post = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    const r = await fetch("/api/settings/channels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    setBusy("");
    if (j?.test) setTestResult(Object.values(j.test).some(Boolean) ? "נשלח ✓" : "לא נשלח (בדוק שהערוץ מחובר ומוגדר בשרת)");
    mutate();
  };
  const waText = encodeURIComponent(`JOIN ${data.code}`);
  const waHref = data.whatsappNumber ? `https://wa.me/${data.whatsappNumber.replace(/[^\d]/g, "")}?text=${waText}` : "";
  const tgHref = data.telegramBot ? `https://t.me/${data.telegramBot}?start=${data.code}` : "";
  const anyLinked = !!(data.whatsapp || data.telegram);

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600 leading-relaxed">
        ההתאמות החדשות, תשובות על הגשות וציוני התרגול יגיעו אליך בהודעה, בלי לפתוח את האתר. החיבור מתחיל מהטלפון שלך עם קוד חד-פעמי, ואפשר להפסיק בכל רגע עם STOP.
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-control border border-line p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-navy inline-flex items-center gap-2"><MessageCircle className="h-4 w-4 text-teal" /> WhatsApp</span>
            {data.whatsapp ? <span className="jm-chip jm-chip-teal"><Check className="h-3 w-3" /> מחובר</span> : <span className="jm-chip">לא מחובר</span>}
          </div>
          {data.whatsapp ? (
            <>
              <p className="jm-muted" dir="ltr">+{data.whatsapp.id}{data.whatsapp.label ? ` · ${data.whatsapp.label}` : ""}</p>
              <button onClick={() => post({ unlink: "whatsapp" }, "wa")} disabled={busy === "wa"} className="jm-btn jm-btn-ghost jm-btn-sm">נתק</button>
            </>
          ) : data.configured.whatsapp && data.whatsappNumber ? (
            <>
              <p className="text-sm text-ink-600">שלח/י את ההודעה <code className="bg-canvas px-1.5 py-0.5 rounded">JOIN {data.code}</code> למספר <span dir="ltr">{data.whatsappNumber}</span>.</p>
              <a href={waHref} target="_blank" rel="noopener noreferrer" className="jm-btn jm-btn-primary jm-btn-sm">פתח וואטסאפ עם ההודעה מוכנה</a>
            </>
          ) : (
            <p className="jm-muted">לא מוגדר בשרת הזה (נדרשים WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID ו-WHATSAPP_DISPLAY_NUMBER).</p>
          )}
        </div>

        <div className="rounded-control border border-line p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-navy inline-flex items-center gap-2"><Send className="h-4 w-4 text-sky" /> Telegram</span>
            {data.telegram ? <span className="jm-chip jm-chip-teal"><Check className="h-3 w-3" /> מחובר</span> : <span className="jm-chip">לא מחובר</span>}
          </div>
          {data.telegram ? (
            <>
              <p className="jm-muted">{data.telegram.label || `chat ${data.telegram.id}`}</p>
              <button onClick={() => post({ unlink: "telegram" }, "tg")} disabled={busy === "tg"} className="jm-btn jm-btn-ghost jm-btn-sm">נתק</button>
            </>
          ) : data.configured.telegram && data.telegramBot ? (
            <>
              <p className="text-sm text-ink-600">פתח/י את הבוט <span dir="ltr">@{data.telegramBot}</span> ולחץ/י Start, או שלח/י <code className="bg-canvas px-1.5 py-0.5 rounded">/start {data.code}</code>.</p>
              <a href={tgHref} target="_blank" rel="noopener noreferrer" className="jm-btn jm-btn-accent jm-btn-sm">פתח את הבוט</a>
            </>
          ) : (
            <p className="jm-muted">לא מוגדר בשרת הזה (נדרשים TELEGRAM_BOT_TOKEN ו-TELEGRAM_BOT_USERNAME).</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="jm-muted">הקוד שלך:</span>
        <code className="font-mono text-base tracking-widest bg-canvas border border-line rounded-control px-3 py-1" dir="ltr">{data.code}</code>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(data.code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="jm-btn jm-btn-ghost jm-btn-sm"
        >
          <Copy className="h-4 w-4" /> {copied ? "הועתק" : "העתק"}
        </button>
        <span className="jm-muted">תקף 24 שעות.</span>
      </div>

      {anyLinked && (
        <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-line">
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={data.prefs.matches} onChange={(e) => post({ prefs: { matches: e.target.checked } }, "p1")} className="accent-teal h-4 w-4" /> התאמות חדשות
          </label>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={data.prefs.updates} onChange={(e) => post({ prefs: { updates: e.target.checked } }, "p2")} className="accent-teal h-4 w-4" /> עדכונים על הגשות, ראיונות ותרגול
          </label>
          <button onClick={() => post({ test: true }, "test")} disabled={busy === "test"} className="jm-btn jm-btn-secondary jm-btn-sm ms-auto">{busy === "test" ? "שולח…" : "שלח הודעת בדיקה"}</button>
          {testResult && <span className="jm-muted">{testResult}</span>}
        </div>
      )}
    </div>
  );
}
