"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { BadgeCheck, Mail } from "lucide-react";
import { useT } from "../lib/i18n/LanguageProvider";

type Profile = { _id: string; company: string; title: string; workEmail: string; verified: boolean; active: boolean; capacity: number; note: string; open: number; stats: { requests: number; accepted: number; submitted: number; declined: number } };
// Must match makeCode in lib/referrals/insiders.ts (8 chars from A-HJ-NP-Z2-9);
// hardcoded because that module is server-only.
const INSIDER_CODE_LENGTH = 8;
const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));

/** Settings: register as an insider at your company (verified by a code sent to your work email) and manage capacity. */
export default function InsiderCard() {
  const { t } = useT();
  const { data, mutate } = useSWR<{ profiles: Profile[] }>("/api/referrals/insiders", fetcher);
  const { data: companies } = useSWR<{ companies: { name: string; domain: string }[] }>("/api/companies?limit=400", fetcher, { revalidateOnFocus: false });
  const [form, setForm] = useState({ company: "", title: "", workEmail: "", note: "" });
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);

  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("register");
    setMsg(null);
    const r = await fetch("/api/referrals/insiders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const j = await r.json().catch(() => null);
    setBusy("");
    if (!r.ok || !j?.ok) {
      setMsg({ kind: "err", text: j?.error === "domain_mismatch" ? t("settings.ins.domainMismatch") : j?.error === "bad_email" ? t("settings.ins.badEmail") : t("settings.ins.registerFailed") });
      return;
    }
    setMsg({ kind: j.sent ? "ok" : "info", text: j.sent ? t("settings.ins.codeSent", { email: form.workEmail }) : t("settings.ins.devCode", { code: j.devCode || t("settings.ins.devCodeNA") }) });
    mutate();
  };

  const verify = async (p: Profile) => {
    setBusy(p._id);
    const r = await fetch("/api/referrals/insiders", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company: p.company, code: codes[p._id] || "" }) });
    const j = await r.json().catch(() => null);
    setBusy("");
    setMsg(j?.ok ? { kind: "ok", text: t("settings.ins.verified", { company: p.company }) } : { kind: "err", text: j?.error === "expired" ? t("settings.ins.expired") : t("settings.ins.wrongCode") });
    mutate();
  };

  const update = async (p: Profile, patch: Record<string, unknown>) => {
    setBusy(p._id);
    await fetch("/api/referrals/insiders", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company: p.company, ...patch }) });
    setBusy("");
    mutate();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600 leading-relaxed">{t("settings.ins.intro")}</p>

      {data?.profiles?.map((p) => (
        <div key={p._id} className="rounded-control border border-line p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-semibold text-navy">{p.company}{p.title ? ` · ${p.title}` : ""}</div>
              <div className="jm-muted" dir="ltr">{p.workEmail}</div>
            </div>
            {p.verified ? <span className="jm-chip jm-chip-teal"><BadgeCheck className="h-3 w-3" /> {t("settings.ins.verifiedChip")}</span> : <span className="jm-chip"><Mail className="h-3 w-3" /> {t("settings.ins.pendingChip")}</span>}
          </div>
          {!p.verified ? (
            <div className="flex flex-wrap items-center gap-2">
              <input value={codes[p._id] || ""} onChange={(e) => setCodes({ ...codes, [p._id]: e.target.value.toUpperCase() })} autoCapitalize="characters" autoComplete="one-time-code" spellCheck={false} maxLength={INSIDER_CODE_LENGTH} placeholder={t("settings.ins.codePlaceholder", { n: INSIDER_CODE_LENGTH })} className="jm-input w-40 font-mono tracking-widest" dir="ltr" />
              <button onClick={() => verify(p)} disabled={busy === p._id || (codes[p._id] || "").trim().length !== INSIDER_CODE_LENGTH} className="jm-btn jm-btn-primary jm-btn-sm">{t("settings.ins.verify")}</button>
              <button onClick={() => { setForm({ company: p.company, title: p.title, workEmail: p.workEmail, note: p.note }); }} className="jm-btn jm-btn-ghost jm-btn-sm">{t("settings.ins.resend")}</button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <label className="inline-flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={p.active} onChange={(e) => update(p, { active: e.target.checked })} className="accent-teal h-4 w-4" /> {t("settings.ins.active")}</label>
              <label className="inline-flex items-center gap-2">{t("settings.ins.upTo")} <input type="number" min={1} max={50} value={p.capacity} onChange={(e) => update(p, { capacity: Number(e.target.value) })} className="jm-input w-20 py-1" /> {t("settings.ins.openRequests")}</label>
              <span className="jm-muted">{t("settings.ins.stats", { open: p.open, submitted: p.stats?.submitted || 0, declined: p.stats?.declined || 0 })}</span>
              <Link href="/referrals" className="jm-btn jm-btn-secondary jm-btn-sm ms-auto">{t("settings.ins.inbox")}</Link>
            </div>
          )}
        </div>
      ))}

      <form onSubmit={register} className="grid sm:grid-cols-2 gap-3">
        <input list="insider-companies" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} required placeholder={t("settings.ins.companyPh")} className="jm-input" />
        <datalist id="insider-companies">{(companies?.companies || []).map((c) => <option key={c.name} value={c.name} />)}</datalist>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t("settings.ins.titlePh")} className="jm-input" />
        <input type="email" value={form.workEmail} onChange={(e) => setForm({ ...form, workEmail: e.target.value })} required placeholder={t("settings.ins.emailPh")} className="jm-input" dir="ltr" />
        <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={t("settings.ins.notePh")} className="jm-input" />
        <div className="sm:col-span-2 flex items-center gap-3">
          <button type="submit" disabled={busy === "register"} className="jm-btn jm-btn-primary">{busy === "register" ? t("settings.ins.sending") : t("settings.ins.sendCode")}</button>
          <span className="jm-muted">{t("settings.ins.codeDomainOnly")}</span>
        </div>
      </form>
      {msg && <p className={`jm-alert ${msg.kind === "ok" ? "jm-alert-ok" : msg.kind === "err" ? "jm-alert-err" : "jm-alert-info"}`}>{msg.text}</p>}
    </div>
  );
}
