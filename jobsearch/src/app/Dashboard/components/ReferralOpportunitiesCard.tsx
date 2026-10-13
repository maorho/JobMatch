"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Users, Send, CheckCircle2, ExternalLink, Sparkles } from "lucide-react";
import CompanyLogo from "@/app/components/CompanyLogo";

type Opp = { jobId: string; jobModel: string; title: string; company: string; city?: string; remote?: boolean; logoUrl?: string; companyDomain?: string; applyUrl?: string; matchScore: number; why?: string; contacts: { _id: string; fullName: string; position: string; url: string }[]; contactCount: number; insiders: number; applied: boolean };
type Data = { opportunities: Opp[]; scanned: number; contacts: number };
const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));

/**
 * Dashboard: the referral loop in one list — ranked postings at companies
 * where you know someone. Apply from here, then write to the contact from
 * the job page (the message is drafted for you there).
 */
export default function ReferralOpportunitiesCard() {
  const { data, mutate, isLoading } = useSWR<Data>("/api/contacts/opportunities", fetcher, { revalidateOnFocus: false });
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState<Record<string, string>>({});
  if (isLoading || !data) return null;
  if (data.contacts === 0) {
    return (
      <section className="jm-card p-5 sm:p-6" dir="rtl">
        <h2 className="jm-h2 mb-2 inline-flex items-center gap-2"><Users className="h-5 w-5 text-teal" /> משרות שיש לך בהן קשר</h2>
        <p className="text-sm text-ink-600 leading-relaxed">ייבא/י את אנשי הקשר מלינקדאין (Connections.csv) ונראה כאן, מתוך ההתאמות שלך, את המשרות בחברות שבהן את/ה מכיר/ה מישהו: הגשה בלחיצה, ופנייה מנוסחת לאיש הקשר.</p>
        <Link href="/Settings#contacts" className="jm-btn jm-btn-primary jm-btn-sm mt-3">ייבוא אנשי קשר</Link>
      </section>
    );
  }
  if (data.opportunities.length === 0) return null;

  const apply = async (o: Opp) => {
    setBusy(o.jobId);
    const r = await fetch("/api/auto-apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply", jobId: o.jobId, jobModel: o.jobModel, score: o.matchScore }) });
    const j = await r.json().catch(() => null);
    setBusy("");
    const msg = !r.ok ? "ההגשה נכשלה" : j?.submitted?.length ? "הוגש ✓" : j?.needsUser?.length ? `צריך אותך: ${j.needsUser[0]?.reason || "השלמה ידנית"}` : j?.skipped ? "כבר הוגש" : j?.failed ? "נכשל" : "נרשם";
    setResult((m) => ({ ...m, [o.jobId]: msg }));
    mutate();
  };
  const applyAll = async () => {
    for (const o of data.opportunities.filter((x) => !x.applied).slice(0, 10)) await apply(o);
  };
  const open = data.opportunities.filter((o) => !o.applied).length;

  return (
    <section id="opportunities" className="jm-card p-5 sm:p-6" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="jm-h2 inline-flex items-center gap-2"><Users className="h-5 w-5 text-teal" /> משרות שיש לך בהן קשר</h2>
          <p className="jm-muted mt-1">{data.opportunities.length} מתוך {data.scanned} ההתאמות שלך הן בחברות שבהן את/ה מכיר/ה מישהו ({data.contacts.toLocaleString()} אנשי קשר). הגש/י, ואז פנה/י לאיש הקשר מעמוד המשרה — הפנייה מנוסחת שם.</p>
        </div>
        {open > 1 && <button onClick={applyAll} disabled={!!busy} className="jm-btn jm-btn-primary jm-btn-sm"><Send className="h-4 w-4" /> הגש ל-{Math.min(open, 10)} הראשונות</button>}
      </div>
      <ul className="divide-y divide-line">
        {data.opportunities.map((o) => (
          <li key={o.jobId} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <CompanyLogo name={o.company} domain={o.companyDomain} logoUrl={o.logoUrl} className="h-10 w-10 rounded-lg border border-line p-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/job/external/${o.jobId}`} className="font-medium text-navy hover:underline">{o.title}</Link>
                <span className="jm-chip jm-chip-teal">{o.matchScore}%</span>
                {o.insiders > 0 && <span className="jm-chip jm-chip-sky">{o.insiders} מבפנים</span>}
              </div>
              <div className="jm-muted">{[o.company, o.city || (o.remote ? "Remote" : "")].filter(Boolean).join(" · ")}</div>
              <div className="text-sm text-ink-600 mt-0.5">
                {o.contacts.slice(0, 3).map((c, i) => (
                  <span key={c._id}>
                    {i > 0 && " · "}
                    {c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{c.fullName}</a> : c.fullName}
                    {c.position ? <span className="text-ink-400"> ({c.position.slice(0, 40)})</span> : null}
                  </span>
                ))}
                {o.contactCount > 3 && <span className="text-ink-400"> ועוד {o.contactCount - 3}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {o.applied || result[o.jobId] === "הוגש ✓" ? (
                <span className="jm-chip jm-chip-teal"><CheckCircle2 className="h-3.5 w-3.5" /> הוגש</span>
              ) : (
                <button onClick={() => apply(o)} disabled={busy === o.jobId} className="jm-btn jm-btn-primary jm-btn-sm">{busy === o.jobId ? "מגיש…" : "הגש"}</button>
              )}
              {result[o.jobId] && result[o.jobId] !== "הוגש ✓" && <span className="jm-muted">{result[o.jobId]}</span>}
              <Link href={`/job/external/${o.jobId}#referrals`} className="jm-btn jm-btn-accent jm-btn-sm"><Sparkles className="h-4 w-4" /> נסח פנייה</Link>
              {o.applyUrl && <a href={o.applyUrl} target="_blank" rel="noopener noreferrer" className="jm-btn jm-btn-ghost jm-btn-icon h-9 w-9" aria-label="המשרה באתר החברה"><ExternalLink className="h-4 w-4" /></a>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
