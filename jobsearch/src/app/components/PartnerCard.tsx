"use client";
import { useEffect, useState } from "react";
import { Handshake } from "lucide-react";
import { useT } from "../lib/i18n/LanguageProvider";

/** Settings: join a bootcamp/college cohort with its invite code (or see which one you're in). */
export default function PartnerCard({ current }: { current?: { slug: string; code: string; cohort?: string } | null }) {
  const { t } = useT();
  const [code, setCode] = useState("");
  const [name, setName] = useState<string>("");
  const [joined, setJoined] = useState<{ name: string } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (current?.code) fetch(`/api/partners/join?code=${encodeURIComponent(current.code)}`).then((r) => r.json()).then((d) => d.valid && setName(d.name)).catch(() => {});
  }, [current?.code]);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const r = await fetch("/api/partners/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const d = await r.json();
    if (!r.ok) return setErr(d?.error || t("settings.partner.failed"));
    setJoined({ name: d.partner.name });
  };

  if (current?.slug || joined) {
    return (
      <p className="text-sm text-ink-600 inline-flex items-center gap-2">
        <Handshake className="h-4 w-4 text-teal" /> {t("settings.partner.memberPrefix")}<span className="font-medium text-navy">{joined?.name || name || current?.slug}</span>{current?.cohort ? ` (${current.cohort})` : ""}{t("settings.partner.memberSuffix")}
      </p>
    );
  }
  return (
    <form onSubmit={join} className="space-y-2">
      <p className="text-sm text-ink-600">{t("settings.partner.pitch")}</p>
      <div className="flex gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-1234" className="jm-input sm:w-48" dir="ltr" />
        <button type="submit" disabled={!code.trim()} className="jm-btn jm-btn-secondary jm-btn-sm">{t("settings.partner.join")}</button>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
    </form>
  );
}
