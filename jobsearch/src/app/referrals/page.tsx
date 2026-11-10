"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Inbox, Send, UserCheck } from "lucide-react";
import { useCurrentUser } from "@/app/lib/hooks/useCurrentUser";
import { PageHeader, Spinner, SignInGate, EmptyState } from "@/app/components/ui";
import { useT } from "@/app/lib/i18n/LanguageProvider";

type Mine = { _id: string; company: string; jobTitle: string; jobId: string; jobModel: string; status: string; referrer: string; referrerNote: string; createdAt: string };
type InboxItem = { _id: string; company: string; jobTitle: string; jobUrl: string; jobId: string; jobModel: string; status: string; message: string; matchScore: number | null; candidate: { id: string; name: string; level: string; currentJob: string; hasResume: boolean }; createdAt: string };
type Profile = { _id: string; company: string; verified: boolean; active: boolean; capacity: number; open: number };
type Data = { mine: Mine[]; inbox: InboxItem[]; profiles: Profile[] };

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
const STATUS_CLS: Record<string, string> = { requested: "jm-chip-sky", accepted: "jm-chip-teal", submitted: "jm-chip-teal", declined: "", withdrawn: "", expired: "" };
const STATUS_KEYS = ["requested", "accepted", "submitted", "declined", "withdrawn", "expired"] as const;
const jobHref = (r: { jobId: string; jobModel: string }) => `/job/${r.jobModel === "Job" ? "internal" : "external"}/${r.jobId}`;

/** /referrals — as a candidate: the referrals I asked for; as an insider: requests waiting for me. */
export default function ReferralsPage() {
  const { t, dir, lang } = useT();
  const { user, loading } = useCurrentUser();
  const { data, mutate } = useSWR<Data>(user ? "/api/referrals/requests" : null, fetcher);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const locale = lang === "he" ? "he-IL" : "en-GB";
  const statusLabel = (s: string) => ((STATUS_KEYS as readonly string[]).includes(s) ? t(`widgets.ref.status.${s as (typeof STATUS_KEYS)[number]}`) : s);
  const chip = (s: string) => <span className={`jm-chip ${STATUS_CLS[s] || ""}`}>{statusLabel(s)}</span>;

  if (!loading && !user) return <div className="jm-page" dir={dir}><SignInGate text={t("widgets.ref.gate")} next="/referrals" /></div>;
  if (!data) return <div className="jm-page" dir={dir}><Spinner label={t("common.loading")} /></div>;

  const act = async (id: string, action: string) => {
    setBusy(id + action);
    await fetch(`/api/referrals/requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, note: notes[id] || "" }) });
    setBusy("");
    mutate();
  };
  const isInsider = data.profiles.some((p) => p.verified);
  const pending = data.inbox.filter((r) => r.status === "requested" || r.status === "accepted");
  const done = data.inbox.filter((r) => !["requested", "accepted"].includes(r.status));

  return (
    <div className="jm-page" dir={dir}>
      <PageHeader title={t("widgets.ref.title")} subtitle={t("widgets.ref.subtitle")} actions={<Link href="/Settings#insider" className="jm-btn jm-btn-secondary jm-btn-sm"><UserCheck className="h-4 w-4" /> {isInsider ? t("widgets.ref.insiderSettings") : t("widgets.ref.iWorkInTech")}</Link>} />

      {isInsider && (
        <section className="mb-10">
          <h2 className="jm-h2 mb-1 inline-flex items-center gap-2"><Inbox className="h-5 w-5 text-teal" /> {t("widgets.ref.inbox")}</h2>
          <p className="jm-muted mb-4">{data.profiles.filter((p) => p.verified).map((p) => t("widgets.ref.openOf", { company: p.company, open: p.open, capacity: p.capacity })).join(" · ")}</p>
          {pending.length === 0 ? (
            <EmptyState icon="📭" title={t("widgets.ref.noneWaiting")} text={t("widgets.ref.noneWaitingText")} />
          ) : (
            <div className="space-y-4">
              {pending.map((r) => (
                <div key={r._id} className="jm-card p-5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-navy">{r.candidate.name}{r.candidate.currentJob ? ` · ${r.candidate.currentJob}` : ""}{r.candidate.level ? ` · ${r.candidate.level}` : ""}</div>
                      <div className="jm-muted">{t("widgets.ref.asksFor")} <Link href={jobHref(r)} className="text-sky hover:underline">{r.jobTitle}</Link> {t("widgets.ref.at", { company: r.company })}{r.matchScore != null ? ` · ${t("widgets.ref.match", { n: r.matchScore })}` : ""} · {new Date(r.createdAt).toLocaleDateString(locale)}</div>
                    </div>
                    {chip(r.status)}
                  </div>
                  {r.message && <blockquote className="text-sm text-ink border-s-2 border-teal ps-3 whitespace-pre-wrap" dir="auto">{r.message}</blockquote>}
                  <div className="flex flex-wrap items-center gap-2">
                    {r.candidate.hasResume && <a href={`/api/referrals/requests/${r._id}/resume`} target="_blank" rel="noopener noreferrer" className="jm-btn jm-btn-secondary jm-btn-sm">{t("widgets.ref.resume")}</a>}
                    {r.jobUrl && <a href={r.jobUrl} target="_blank" rel="noopener noreferrer" className="jm-btn jm-btn-ghost jm-btn-sm">{t("widgets.ref.jobOnSite")}</a>}
                    <input value={notes[r._id] || ""} onChange={(e) => setNotes({ ...notes, [r._id]: e.target.value })} placeholder={t("widgets.ref.notePh")} className="jm-input flex-1 min-w-[12rem] py-2 text-sm" />
                    {r.status === "requested" && <button onClick={() => act(r._id, "accept")} disabled={!!busy} className="jm-btn jm-btn-secondary jm-btn-sm">{t("widgets.ref.take")}</button>}
                    <button onClick={() => act(r._id, "submitted")} disabled={!!busy} className="jm-btn jm-btn-primary jm-btn-sm"><Send className="h-4 w-4" /> {t("widgets.ref.submitted")}</button>
                    <button onClick={() => act(r._id, "decline")} disabled={!!busy} className="jm-btn jm-btn-ghost jm-btn-sm text-red-600">{t("widgets.ref.notNow")}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {done.length > 0 && (
            <details className="mt-4">
              <summary className="jm-muted cursor-pointer">{t("widgets.ref.history", { n: done.length })}</summary>
              <ul className="mt-2 space-y-1 text-sm">
                {done.map((r) => <li key={r._id} className="flex items-center gap-2">{chip(r.status)} {r.candidate.name} · {r.jobTitle}</li>)}
              </ul>
            </details>
          )}
        </section>
      )}

      <section>
        <h2 className="jm-h2 mb-1 inline-flex items-center gap-2"><Send className="h-5 w-5 text-sky" /> {t("widgets.ref.mine")}</h2>
        <p className="jm-muted mb-4">{t("widgets.ref.mineText")}</p>
        {data.mine.length === 0 ? (
          <EmptyState icon="🤝" title={t("widgets.ref.noneMine")} text={t("widgets.ref.noneMineText")} action={<Link href="/jobs" className="jm-btn jm-btn-primary">{t("widgets.ref.toJobs")}</Link>} />
        ) : (
          <div className="jm-card divide-y divide-line">
            {data.mine.map((r) => (
              <div key={r._id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link href={jobHref(r)} className="font-medium text-navy hover:underline">{r.jobTitle}</Link>
                  <div className="jm-muted">{r.company}{r.referrer ? ` · ${r.referrer}` : ""} · {new Date(r.createdAt).toLocaleDateString(locale)}{r.referrerNote ? ` · "${r.referrerNote}"` : ""}</div>
                </div>
                <div className="flex items-center gap-2">
                  {chip(r.status)}
                  {(r.status === "requested" || r.status === "accepted") && <button onClick={() => act(r._id, "withdraw")} disabled={!!busy} className="jm-btn jm-btn-ghost jm-btn-sm">{t("widgets.ref.withdraw")}</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
