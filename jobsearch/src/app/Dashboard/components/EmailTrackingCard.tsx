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
  "Recived an Offer": "bg-[#24A8A2]/10 text-[#1d8f8a] border-[#24A8A2]/30",
  Accepted: "bg-[#24A8A2]/10 text-[#1d8f8a] border-[#24A8A2]/30",
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
    <section className="mx-auto max-w-[1200px] px-4 mb-8 font-outfit" dir="rtl">
      <div className="rounded-[24px] border border-[#232323]/10 bg-white p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[#232323]">📬 מעקב סטטוס מהמייל</h2>
            <p className="text-sm text-[#232323]/60 mt-1">
              {data.connected
                ? <>מחובר ל-<span dir="ltr">{data.address}</span>{data.lastSyncAt ? ` · סנכרון אחרון ${dayjs(data.lastSyncAt).fromNow()}` : " · עדיין לא סונכרן"}. הסוכן קורא רק מיילים על מועמדויות ומעדכן את הסטטוס אוטומטית.</>
                : "חבר/י את ה-Gmail שלך והסטטוס של כל מועמדות יתעדכן לבד מתשובות המגייסים — זימון לראיון, הצעה או דחייה."}
            </p>
            {data.lastError && <p className="text-sm text-red-600 mt-1">⚠️ {data.lastError}</p>}
            {note && <p className="text-sm text-[#232323]/70 mt-1">{note}</p>}
          </div>
          <div className="flex gap-2 shrink-0">
            {data.connected ? (
              <>
                <button onClick={syncNow} disabled={syncing} className="bg-[#24A8A2] hover:bg-[#1d8f8a] text-white px-4 py-2.5 rounded-[14px] text-sm transition disabled:opacity-60">
                  {syncing ? "מסנכרן…" : "סנכרן עכשיו"}
                </button>
                <Link href="/Settings" className="border border-[#232323]/15 px-4 py-2.5 rounded-[14px] text-sm hover:bg-[#F9F9F9]">הגדרות</Link>
              </>
            ) : data.configured ? (
              <a href="/api/integrations/gmail/connect" className="bg-[#11AEFF] hover:bg-[#0d8ed6] text-white px-4 py-2.5 rounded-[14px] text-sm transition">חבר Gmail</a>
            ) : (
              <span className="text-xs text-[#232323]/50 self-center">החיבור ל-Gmail עדיין לא מוגדר בסביבה הזו</span>
            )}
          </div>
        </div>

        {data.connected && data.events.length > 0 && (
          <ul className="mt-4 divide-y divide-[#232323]/10">
            {data.events.slice(0, 8).map((e) => (
              <li key={e._id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <span className={`shrink-0 rounded-full border px-3 py-1 text-xs ${STATUS_STYLE[e.status] || "bg-[#F9F9F9] text-[#232323] border-[#232323]/10"}`}>
                  {e.status || "לא זוהה סטטוס"}{e.applied ? " ✓" : ""}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-[#232323] truncate" dir="auto">
                    <span className="font-medium">{[e.roleTitle, e.company].filter(Boolean).join(" · ") || e.emailSubject}</span>
                    {e.summary && <span className="text-[#232323]/60"> — {e.summary}</span>}
                  </div>
                  <div className="text-xs text-[#232323]/50 truncate" dir="auto">{e.emailSubject} · {e.emailFrom}</div>
                </div>
                <span className="shrink-0 text-xs text-[#232323]/50">{e.emailDate ? dayjs(e.emailDate).fromNow() : ""}</span>
              </li>
            ))}
          </ul>
        )}
        {data.connected && data.events.length === 0 && (
          <p className="mt-3 text-sm text-[#232323]/50">עדיין לא זוהו מיילים על מועמדויות. הסריקה רצה כל שעתיים — או לחץ/י &quot;סנכרן עכשיו&quot;.</p>
        )}
      </div>
    </section>
  );
}
