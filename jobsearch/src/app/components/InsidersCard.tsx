"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { UserCheck, Send } from "lucide-react";
import { useT } from "../lib/i18n/LanguageProvider";
import type { Key } from "../lib/i18n/dict";

type Insider = { _id: string; firstName: string; title: string; note: string; available: boolean };
type Data = { count: number; available: number; insiders: Insider[] };
type Mine = { mine: { jobId: string; status: string; referrer: string }[] };
const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
const STATUS_KEY: Record<string, Key> = {
  requested: "widgets.ins.status.requested",
  accepted: "widgets.ins.status.accepted",
  submitted: "widgets.ins.status.submitted",
  declined: "widgets.ins.status.declined",
  withdrawn: "widgets.ins.status.withdrawn",
  expired: "widgets.ins.status.expired",
};

/** Job page sidebar: verified employees at this company who will refer you, and the request itself. */
export default function InsidersCard({ company, jobId, jobModel, matchScore }: { company: string; jobId: string; jobModel: "Job" | "ExternalJobs"; matchScore?: number | null }) {
  const { t, dir } = useT();
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
      setErr(j?.error === "too_many_open" ? t("widgets.ins.errTooMany") : j?.error === "full" ? t("widgets.ins.errFull") : j?.error === "self" ? t("widgets.ins.errSelf") : t("widgets.ins.errSend"));
      return;
    }
    setOpen(false);
    mutate();
  };

  const who = data.count === 1 ? t("widgets.ins.oneVerified") : t("widgets.ins.nVerified", { n: data.count });

  return (
    <div className="jm-card p-4 space-y-3" dir={dir}>
      <h3 className="jm-h2 text-base inline-flex items-center gap-2"><UserCheck className="h-4 w-4 text-teal" /> {t("widgets.ins.title", { company })}</h3>
      <p className="text-sm text-ink-600 leading-relaxed">{t("widgets.ins.intro", { who, company })}</p>
      <ul className="space-y-1.5">
        {data.insiders.slice(0, 4).map((i) => (
          <li key={i._id} className="text-sm flex items-center gap-2">
            <span className="h-7 w-7 rounded-full bg-teal-50 text-teal-600 font-semibold flex items-center justify-center text-xs">{i.firstName.charAt(0)}</span>
            <span className="text-navy font-medium">{i.firstName}</span>
            {i.title && <span className="jm-muted">· {i.title}</span>}
            {!i.available && <span className="jm-chip">{t("widgets.ins.full")}</span>}
          </li>
        ))}
      </ul>
      {existing ? (
        <div className="jm-alert jm-alert-info text-sm">
          {existing.referrer ? t("widgets.ins.requestTo", { name: existing.referrer }) : t("widgets.ins.request")} <b>{STATUS_KEY[existing.status] ? t(STATUS_KEY[existing.status]) : existing.status}</b>. <Link href="/referrals" className="underline">{t("widgets.ins.allRequests")}</Link>
        </div>
      ) : open ? (
        <div className="space-y-2">
          {data.insiders.length > 1 && (
            <select value={chosen} onChange={(e) => setChosen(e.target.value)} className="jm-input jm-select">
              <option value="">{t("widgets.ins.whoeverFree")}</option>
              {data.insiders.filter((i) => i.available).map((i) => <option key={i._id} value={i._id}>{i.firstName}{i.title ? ` · ${i.title}` : ""}</option>)}
            </select>
          )}
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1200} rows={4} className="jm-input" placeholder={t("widgets.ins.msgPlaceholder")} />
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex gap-2">
            <button onClick={send} disabled={busy || message.trim().length < 20} className="jm-btn jm-btn-primary jm-btn-sm"><Send className="h-4 w-4" /> {busy ? t("widgets.ins.sending") : t("widgets.ins.send")}</button>
            <button onClick={() => setOpen(false)} className="jm-btn jm-btn-ghost jm-btn-sm">{t("widgets.ins.cancel")}</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} disabled={data.available === 0} className="jm-btn jm-btn-primary w-full">{data.available === 0 ? t("widgets.ins.allFull") : t("widgets.ins.ask")}</button>
      )}
    </div>
  );
}
