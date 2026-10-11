"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { UserCheck, Send } from "lucide-react";

type Insider = { _id: string; firstName: string; title: string; note: string; available: boolean };
type Data = { count: number; available: number; insiders: Insider[] };
type Mine = { mine: { jobId: string; status: string; referrer: string }[] };
const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
const STATUS_HE: Record<string, string> = { requested: "ממתין לתשובה", accepted: "אושר, בדרך להגשה", submitted: "הוגש עם הפניה", declined: "נדחה", withdrawn: "בוטל", expired: "פג תוקף" };

/** Job page sidebar: verified employees at this company who will refer you, and the request itself. */
export default function InsidersCard({ company, jobId, jobModel, matchScore }: { company: string; jobId: string; jobModel: "Job" | "ExternalJobs"; matchScore?: number | null }) {
  const { data } = useSWR<Data>(company ? `/api/referrals/insiders?company=${encodeURIComponent(company)}` : null, fetcher);
  const { data: mine, mutate } = useSWR<Mine>("/api/referrals/requests", fetcher);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string>("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!data || data.count === 0) return null;
  const existing = mine?.mine?.find((r) => r.jobId === jobId);

  const send = async () => {
    setBusy(true);
    setErr("");
    const r = await fetch("/api/referrals/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, jobModel, referrerId: chosen || undefined, message, matchScore: matchScore ?? null }) });
    const j = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok || !j?.ok) {
      setErr(j?.error === "too_many_open" ? "יש לך כבר 5 בקשות פתוחות. חכה/י לתשובות." : j?.error === "full" ? "הממליץ/ה הזה/זו מלא/ה כרגע. נסו אחר/ת." : j?.error === "self" ? "זו המשרה שלך…" : "לא הצלחנו לשלוח. נסו שוב.");
      return;
    }
    setOpen(false);
    mutate();
  };

  return (
    <div className="jm-card p-4 space-y-3">
      <h3 className="jm-h2 text-base inline-flex items-center gap-2"><UserCheck className="h-4 w-4 text-teal" /> מישהו מבפנים ב-{company}</h3>
      <p className="text-sm text-ink-600 leading-relaxed">
        {data.count === 1 ? "עובד/ת אחד/ת מאומת/ת" : `${data.count} עובדים מאומתים`} ב-{company} מוכנים להגיש קו&quot;ח של מועמדים מתאימים ישירות למגייס. הפניה מבפנים מכפילה את הסיכוי לראיון.
      </p>
      <ul className="space-y-1.5">
        {data.insiders.slice(0, 4).map((i) => (
          <li key={i._id} className="text-sm flex items-center gap-2">
            <span className="h-7 w-7 rounded-full bg-teal-50 text-teal-600 font-semibold flex items-center justify-center text-xs">{i.firstName.charAt(0)}</span>
            <span className="text-navy font-medium">{i.firstName}</span>
            {i.title && <span className="jm-muted">· {i.title}</span>}
            {!i.available && <span className="jm-chip">מלא/ה</span>}
          </li>
        ))}
      </ul>
      {existing ? (
        <div className="jm-alert jm-alert-info text-sm">
          בקשת הפניה {existing.referrer ? `ל${existing.referrer}` : ""}: <b>{STATUS_HE[existing.status] || existing.status}</b>. <Link href="/referrals" className="underline">לכל הבקשות</Link>
        </div>
      ) : open ? (
        <div className="space-y-2">
          {data.insiders.length > 1 && (
            <select value={chosen} onChange={(e) => setChosen(e.target.value)} className="jm-input jm-select">
              <option value="">מי שפנוי/ה (מומלץ)</option>
              {data.insiders.filter((i) => i.available).map((i) => <option key={i._id} value={i._id}>{i.firstName}{i.title ? ` · ${i.title}` : ""}</option>)}
            </select>
          )}
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1200} rows={4} className="jm-input" placeholder="2–3 משפטים לממליץ/ה: מי את/ה, למה המשרה הזו, ומה מתאים בקו״ח שלך. בלי קישורים חיצוניים." />
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex gap-2">
            <button onClick={send} disabled={busy || message.trim().length < 20} className="jm-btn jm-btn-primary jm-btn-sm"><Send className="h-4 w-4" /> {busy ? "שולח…" : "שלח בקשה"}</button>
            <button onClick={() => setOpen(false)} className="jm-btn jm-btn-ghost jm-btn-sm">ביטול</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} disabled={data.available === 0} className="jm-btn jm-btn-primary w-full">{data.available === 0 ? "כולם מלאים כרגע" : "בקש/י הפניה מבפנים"}</button>
      )}
    </div>
  );
}
