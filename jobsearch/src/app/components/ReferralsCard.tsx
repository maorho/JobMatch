"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Copy, ExternalLink, Sparkles } from "lucide-react";
import { useT } from "../lib/i18n/LanguageProvider";

type Contact = { _id: string; fullName: string; position: string; company: string; url: string; email: string };
type Draft = { subject: string; message: string; angle: string; forwardNote: string };

/** Job page sidebar: who you know at this company + an AI-drafted referral request. */
export default function ReferralsCard({ company, jobId, source, jobUrl }: { company: string; jobId: string; source: "internal" | "external"; jobUrl?: string }) {
  const { t, dir } = useT();
  const [data, setData] = useState<{ total: number; contacts: Contact[] } | null>(null);
  const [active, setActive] = useState<Contact | null>(null);
  const [channel, setChannel] = useState<"linkedin" | "note" | "email">("linkedin");
  // How the sender knows this contact, in their words: the opening line of the message. Kept per contact.
  const [relationship, setRelationship] = useState("");
  const [language, setLanguage] = useState<"he" | "en">("he");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!company) return;
    fetch(`/api/contacts?company=${encodeURIComponent(company)}`)
      .then(async (r) => {
        if (!r.ok) return;
        const d = await r.json();
        setData({ total: d.stats.total, contacts: d.contacts });
      })
      .catch(() => {});
  }, [company]);

  const compose = async (c: Contact, ch = channel, lang = language, rel = relationship) => {
    if (active?._id !== c._id) { setRelationship(""); rel = ""; }
    setActive(c);
    setBusy(true);
    setErr("");
    setDraft(null);
    setCopied(false);
    try {
      const r = await fetch("/api/contacts/outreach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId: c._id, jobId, source, channel: ch, language: lang, url: jobUrl, relationship: rel || undefined }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.message || d?.error || (r.status === 429 ? t("widgets.ref.quotaErr") : t("widgets.ref.draftFailed")));
      setDraft({ subject: d.subject, message: d.message, angle: d.angle, forwardNote: d.forwardNote || "" });
    } catch (e: any) {
      setErr(e?.message || t("widgets.ref.draftFailed"));
    } finally {
      setBusy(false);
    }
  };

  const [copiedNote, setCopiedNote] = useState(false);
  const copy = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.subject ? `${draft.subject}\n\n${draft.message}` : draft.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  const copyNote = async () => {
    if (!draft?.forwardNote) return;
    try {
      await navigator.clipboard.writeText(draft.forwardNote);
      setCopiedNote(true);
      setTimeout(() => setCopiedNote(false), 2000);
    } catch {}
  };

  if (!company || !data) return null;

  if (data.total === 0) {
    return (
      <section className="jm-card p-5" dir={dir}>
        <h3 className="jm-h2 mb-2 inline-flex items-center gap-2"><Users className="h-5 w-5 text-teal" /> {t("widgets.ref.knowAnyone", { company })}</h3>
        <p className="text-sm text-ink-600 leading-relaxed">{t("widgets.ref.importText")}</p>
        <Link href="/Settings#contacts" className="jm-btn jm-btn-secondary jm-btn-sm mt-3">{t("widgets.ref.importBtn")}</Link>
      </section>
    );
  }

  const channelLabel = { linkedin: t("widgets.ref.chLinkedin"), note: t("widgets.ref.chNote"), email: t("widgets.ref.chEmail") } as const;

  return (
    <section id="referrals" className="jm-card p-5 space-y-3 scroll-mt-24" dir={dir}>
      <h3 className="jm-h2 inline-flex items-center gap-2"><Users className="h-5 w-5 text-teal" /> {data.contacts.length ? t("widgets.ref.contactsAt", { n: data.contacts.length, company }) : t("widgets.ref.noContactsAt", { company })}</h3>
      {data.contacts.length === 0 && <p className="jm-muted">{t("widgets.ref.noneOfTotal", { total: data.total.toLocaleString() })}</p>}
      <ul className="space-y-2">
        {data.contacts.map((c) => (
          <li key={c._id} className={`rounded-control border px-3 py-2 ${active?._id === c._id ? "border-teal bg-teal-50" : "border-line"}`}>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-navy truncate">{c.fullName}</div>
                {c.position && <div className="text-xs text-ink-600 truncate">{c.position}</div>}
              </div>
              {c.url && (
                <a href={c.url} target="_blank" rel="noreferrer" aria-label="LinkedIn" className="jm-btn jm-btn-ghost jm-btn-icon h-9 w-9">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              <button type="button" disabled={busy} onClick={() => compose(c)} className="jm-btn jm-btn-accent jm-btn-sm">
                <Sparkles className="h-4 w-4" /> {t("widgets.ref.compose")}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {active && (
        <div className="rounded-control border border-line p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="jm-muted">{t("widgets.ref.messageTo", { name: active.fullName })}</span>
            {(["linkedin", "note", "email"] as const).map((ch) => (
              <button key={ch} type="button" onClick={() => { setChannel(ch); compose(active, ch, language); }} className={`jm-chip ${channel === ch ? "jm-chip-navy" : ""}`} title={ch === "note" ? t("widgets.ref.noteTitle") : undefined}>{channelLabel[ch]}</button>
            ))}
            {(["he", "en"] as const).map((l) => (
              <button key={l} type="button" onClick={() => { setLanguage(l); compose(active, channel, l); }} className={`jm-chip ${language === l ? "jm-chip-navy" : ""}`}>{l === "he" ? t("widgets.ref.langHe") : t("widgets.ref.langEn")}</button>
            ))}
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); compose(active, channel, language, relationship); }}
            className="flex gap-2"
          >
            <input
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              maxLength={300}
              dir={dir}
              placeholder={t("widgets.ref.relPlaceholder")}
              className="jm-input text-sm flex-1"
              aria-label={t("widgets.ref.relAria")}
            />
            <button type="submit" disabled={busy} className="jm-btn jm-btn-secondary jm-btn-sm shrink-0">{t("widgets.ref.redraft")}</button>
          </form>
          {busy && <p className="jm-muted">{t("widgets.ref.drafting")}</p>}
          {err && <p className="jm-alert jm-alert-err">{err}</p>}
          {draft && (
            <>
              {draft.subject && <p className="text-sm font-semibold" dir={dir}>{draft.subject}</p>}
              <textarea readOnly value={draft.message} rows={7} dir={dir} className="jm-input text-sm leading-relaxed" />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={copy} className="jm-btn jm-btn-primary jm-btn-sm"><Copy className="h-4 w-4" /> {copied ? t("widgets.ref.copied") : t("widgets.ref.copy")}</button>
                {active.url && <a href={active.url} target="_blank" rel="noreferrer" className="jm-btn jm-btn-secondary jm-btn-sm">{t("widgets.ref.openLinkedin")}</a>}
                {draft.angle && <span className="jm-muted" dir={dir}>{draft.angle}</span>}
              </div>
              {draft.forwardNote && (
                <div className="rounded-control bg-canvas border border-line p-3 space-y-2">
                  <p className="text-xs font-semibold text-navy">{t("widgets.ref.forwardTitle")}</p>
                  <textarea readOnly value={draft.forwardNote} rows={3} dir={dir} className="jm-input text-sm leading-relaxed" />
                  <button type="button" onClick={copyNote} className="jm-btn jm-btn-secondary jm-btn-sm"><Copy className="h-4 w-4" /> {copiedNote ? t("widgets.ref.copied") : t("widgets.ref.copyForward")}</button>
                </div>
              )}
              <details className="text-xs text-ink-600">
                <summary className="cursor-pointer font-medium text-navy">{t("widgets.ref.checklist")}</summary>
                <ul className="list-disc ps-5 mt-1 space-y-0.5">
                  <li>{t("widgets.ref.check1")}</li>
                  <li>{t("widgets.ref.check2")}</li>
                  <li>{t("widgets.ref.check3")}</li>
                  <li>{t("widgets.ref.check4")}</li>
                </ul>
              </details>
            </>
          )}
        </div>
      )}
    </section>
  );
}
