"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Copy, ExternalLink, Sparkles } from "lucide-react";

type Contact = { _id: string; fullName: string; position: string; company: string; url: string; email: string };
type Draft = { subject: string; message: string; angle: string };

/** Job page sidebar: who you know at this company + an AI-drafted referral request. */
export default function ReferralsCard({ company, jobId, source, jobUrl }: { company: string; jobId: string; source: "internal" | "external"; jobUrl?: string }) {
  const [data, setData] = useState<{ total: number; contacts: Contact[] } | null>(null);
  const [active, setActive] = useState<Contact | null>(null);
  const [channel, setChannel] = useState<"linkedin" | "email">("linkedin");
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

  const compose = async (c: Contact, ch = channel, lang = language) => {
    setActive(c);
    setBusy(true);
    setErr("");
    setDraft(null);
    setCopied(false);
    try {
      const r = await fetch("/api/contacts/outreach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId: c._id, jobId, source, channel: ch, language: lang, url: jobUrl }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.message || d?.error || (r.status === 429 ? "הגעת למכסה היומית. נסו שוב מחר." : "הניסוח נכשל"));
      setDraft({ subject: d.subject, message: d.message, angle: d.angle });
    } catch (e: any) {
      setErr(e?.message || "הניסוח נכשל");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.subject ? `${draft.subject}\n\n${draft.message}` : draft.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  if (!company || !data) return null;

  if (data.total === 0) {
    return (
      <section className="jm-card p-5" dir="rtl">
        <h3 className="jm-h2 mb-2 inline-flex items-center gap-2"><Users className="h-5 w-5 text-teal" /> מכיר/ה מישהו ב-{company}?</h3>
        <p className="text-sm text-ink-600 leading-relaxed">ייבא/י את אנשי הקשר מלינקדאין ונראה לך בכל משרה מי מהם עובד בחברה — וננסח בשבילך בקשת referral.</p>
        <Link href="/Settings#contacts" className="jm-btn jm-btn-secondary jm-btn-sm mt-3">ייבוא אנשי קשר</Link>
      </section>
    );
  }

  return (
    <section id="referrals" className="jm-card p-5 space-y-3 scroll-mt-24" dir="rtl">
      <h3 className="jm-h2 inline-flex items-center gap-2"><Users className="h-5 w-5 text-teal" /> {data.contacts.length ? `${data.contacts.length} אנשי קשר ב-${company}` : `אין לך אנשי קשר ב-${company}`}</h3>
      {data.contacts.length === 0 && <p className="jm-muted">מתוך {data.total.toLocaleString()} אנשי הקשר שייבאת, אף אחד לא רשום בחברה הזו.</p>}
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
                <Sparkles className="h-4 w-4" /> נסח פנייה
              </button>
            </div>
          </li>
        ))}
      </ul>

      {active && (
        <div className="rounded-control border border-line p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="jm-muted">הודעה ל{active.fullName}:</span>
            {(["linkedin", "email"] as const).map((ch) => (
              <button key={ch} type="button" onClick={() => { setChannel(ch); compose(active, ch, language); }} className={`jm-chip ${channel === ch ? "jm-chip-navy" : ""}`}>{ch === "linkedin" ? "LinkedIn" : "אימייל"}</button>
            ))}
            {(["he", "en"] as const).map((l) => (
              <button key={l} type="button" onClick={() => { setLanguage(l); compose(active, channel, l); }} className={`jm-chip ${language === l ? "jm-chip-navy" : ""}`}>{l === "he" ? "עברית" : "English"}</button>
            ))}
          </div>
          {busy && <p className="jm-muted">מנסח…</p>}
          {err && <p className="jm-alert jm-alert-err">{err}</p>}
          {draft && (
            <>
              {draft.subject && <p className="text-sm font-semibold" dir="auto">{draft.subject}</p>}
              <textarea readOnly value={draft.message} rows={7} dir="auto" className="jm-input text-sm leading-relaxed" />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={copy} className="jm-btn jm-btn-primary jm-btn-sm"><Copy className="h-4 w-4" /> {copied ? "הועתק!" : "העתק"}</button>
                {active.url && <a href={active.url} target="_blank" rel="noreferrer" className="jm-btn jm-btn-secondary jm-btn-sm">פתח בלינקדאין</a>}
                {draft.angle && <span className="jm-muted" dir="auto">{draft.angle}</span>}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
