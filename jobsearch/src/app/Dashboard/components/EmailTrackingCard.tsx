"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";

dayjs.extend(relativeTime);

type Ev = { _id: string; status: string; company: string; roleTitle: string; summary: string; emailSubject: string; emailFrom: string; emailDate?: string; applied: boolean; confidence: number };
type Status = { connected: boolean; address: string; lastSyncAt: string | null; lastError: string; configured: boolean; events: Ev[] };

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));

const STATUS_STYLE: Record<string, string> = {
  Rejected: "bg-red-50 text-red-700 border-red-200",
  "Recived an Offer": "jm-chip-teal",
  Accepted: "jm-chip-teal",
};

/**
 * "Email tracking" card on the candidate dashboard: Gmail connection state,
 * manual sync, and the timeline of status changes detected from emails.
 */
export default function EmailTrackingCard() {
  const { data, mutate } = useSWR<Status>("/api/integrations/gmail", fetcher, { refreshInterval: 60_000 });
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState("");

  const syncNow = async () => {
    setSyncing(true);
    setNote("");
    try {
      const r = await fetch("/api/integrations/gmail", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || "הסנכרון נכשל");
      setNote(d.error ? `⚠️ ${d.error}` : `נסרקו ${d.fetched} מיילים · ${d.updated} עדכוני סטטוס`);
      mutate();
    } catch (e) {
      setNote(`⚠️ ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  if (!data) return null;

  return (
    <section className="jm-card p-5 sm:p-6" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="min-w-0">
          <h2 className="jm-h2">📬 מעקב סטטוס מהמייל</h2>
          <p className="text-sm text-ink-600 mt-1">
            {data.connected
              ? <>מחובר ל-<span dir="ltr">{data.address}</span>{data.lastSyncAt ? ` · סנכרון אחרון ${dayjs(data.lastSyncAt).fromNow()}` : " · עדיין לא סונכרן"}. הסוכן קורא רק מיילים על מועמדויות ומעדכן את הסטטוס אוטומטית.</>
              : "חבר/י את ה-Gmail שלך והסטטוס של כל מועמדות יתעדכן לבד מתשובות המגייסים — זימון לראיון, הצעה או דחייה."}
          </p>
          {data.lastError && <p className="text-sm text-red-600 mt-1">⚠️ {data.lastError}</p>}
          {note && <p className="text-sm text-ink-600 mt-1">{note}</p>}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {data.connected ? (
            <>
              <button onClick={syncNow} disabled={syncing} className="jm-btn jm-btn-primary jm-btn-sm">
                {syncing ? "מסנכרן…" : "סנכרן עכשיו"}
              </button>
              <Link href="/Settings" className="jm-btn jm-btn-secondary jm-btn-sm">הגדרות</Link>
            </>
          ) : data.configured ? (
            <a href="/api/integrations/gmail/connect" className="jm-btn jm-btn-accent jm-btn-sm">חבר Gmail</a>
          ) : (
            <span className="jm-muted self-center">החיבור ל-Gmail עדיין לא מוגדר בסביבה הזו</span>
          )}
        </div>
      </div>

      {data.connected && data.events.length > 0 && (
        <ul className="mt-4 divide-y divide-line">
          {data.events.slice(0, 8).map((e) => (
            <li key={e._id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2">
              <span className={`jm-chip shrink-0 ${STATUS_STYLE[e.status] || ""}`}>
                {e.status || "לא זוהה סטטוס"}{e.applied ? " ✓" : ""}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-ink truncate" dir="auto">
                  <span className="font-medium">{[e.roleTitle, e.company].filter(Boolean).join(" · ") || e.emailSubject}</span>
                  {e.summary && <span className="text-ink-600"> — {e.summary}</span>}
                </div>
                <div className="text-xs text-ink-400 truncate" dir="auto">{e.emailSubject} · {e.emailFrom}</div>
              </div>
              <span className="shrink-0 text-xs text-ink-400">{e.emailDate ? dayjs(e.emailDate).fromNow() : ""}</span>
            </li>
          ))}
        </ul>
      )}
      {data.connected && data.events.length === 0 && (
        <p className="mt-3 jm-muted">עדיין לא זוהו מיילים על מועמדויות. הסריקה רצה כל שעתיים — או לחץ/י &quot;סנכרן עכשיו&quot;.</p>
      )}
    </section>
  );
}
