"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";
import "dayjs/locale/he.js";
import { useT } from "../../lib/i18n/LanguageProvider";
import { STATUS_LABEL_KEY } from "../../lib/i18n/dict/dashboard";

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
  const { t, lang, dir } = useT();
  const { data, mutate } = useSWR<Status>("/api/integrations/gmail", fetcher, { refreshInterval: 60_000 });
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState("");

  const syncNow = async () => {
    setSyncing(true);
    setNote("");
    try {
      const r = await fetch("/api/integrations/gmail", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || t("dashboard.email.syncFailed"));
      setNote(d.error ? `⚠️ ${d.error}` : t("dashboard.email.syncResult", { fetched: d.fetched, updated: d.updated }));
      mutate();
    } catch (e) {
      setNote(`⚠️ ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  if (!data) return null;
  const statusLabel = (s: string) => (s in STATUS_LABEL_KEY ? t(STATUS_LABEL_KEY[s as keyof typeof STATUS_LABEL_KEY]) : s);

  return (
    <section className="jm-card p-5 sm:p-6" dir={dir}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="min-w-0">
          <h2 className="jm-h2">{t("dashboard.email.title")}</h2>
          <p className="text-sm text-ink-600 mt-1">
            {data.connected
              ? <>{t("dashboard.email.connectedTo")}<span dir="ltr">{data.address}</span>{data.lastSyncAt ? t("dashboard.email.lastSync", { ago: dayjs(data.lastSyncAt).locale(lang).fromNow() }) : t("dashboard.email.notSynced")}{t("dashboard.email.connectedText")}</>
              : t("dashboard.email.notConnected")}
          </p>
          {data.lastError && <p className="text-sm text-red-600 mt-1">⚠️ {data.lastError}</p>}
          {note && <p className="text-sm text-ink-600 mt-1">{note}</p>}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {data.connected ? (
            <>
              <button onClick={syncNow} disabled={syncing} className="jm-btn jm-btn-primary jm-btn-sm">
                {syncing ? t("dashboard.email.syncing") : t("dashboard.email.syncNow")}
              </button>
              <Link href="/Settings" className="jm-btn jm-btn-secondary jm-btn-sm">{t("nav.settings")}</Link>
            </>
          ) : data.configured ? (
            <a href="/api/integrations/gmail/connect" className="jm-btn jm-btn-accent jm-btn-sm">{t("dashboard.email.connect")}</a>
          ) : (
            <span className="jm-muted self-center">{t("dashboard.email.notConfigured")}</span>
          )}
        </div>
      </div>

      {data.connected && data.events.length > 0 && (
        <ul className="mt-4 divide-y divide-line">
          {data.events.slice(0, 8).map((e) => (
            <li key={e._id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2">
              <span className={`jm-chip shrink-0 ${STATUS_STYLE[e.status] || ""}`}>
                {e.status ? statusLabel(e.status) : t("dashboard.email.noStatus")}{e.applied ? " ✓" : ""}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-ink truncate" dir="auto">
                  <span className="font-medium">{[e.roleTitle, e.company].filter(Boolean).join(" · ") || e.emailSubject}</span>
                  {e.summary && <span className="text-ink-600"> — {e.summary}</span>}
                </div>
                <div className="text-xs text-ink-400 truncate" dir="auto">{e.emailSubject} · {e.emailFrom}</div>
              </div>
              <span className="shrink-0 text-xs text-ink-400">{e.emailDate ? dayjs(e.emailDate).locale(lang).fromNow() : ""}</span>
            </li>
          ))}
        </ul>
      )}
      {data.connected && data.events.length === 0 && (
        <p className="mt-3 jm-muted">{t("dashboard.email.noEvents")}</p>
      )}
    </section>
  );
}
