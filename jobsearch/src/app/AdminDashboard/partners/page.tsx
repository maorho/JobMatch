"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useCurrentUser } from "@/app/lib/hooks/useCurrentUser";
import { PageHeader, Spinner, EmptyState, SignInGate } from "@/app/components/ui";

type Funnel = { members: number; withResume: number; applied: number; applications: number; interviews: number; offers: number; mockInterviews: number; activeLast7d: number; responseRate: number | null };
type P = { _id: string; name: string; slug: string; kind: string; inviteCode: string; cohort: string; blurb: string; active: boolean; createdAt: string; landingUrl: string; signupUrl: string; funnel: Funnel };

const KIND_HE: Record<string, string> = { bootcamp: "בוטקמפ", college: "מכללה", community: "קהילה", other: "אחר" };

export default function AdminPartnersPage() {
  const { user, loading } = useCurrentUser();
  const [items, setItems] = useState<P[] | null>(null);
  const [form, setForm] = useState({ name: "", kind: "bootcamp", cohort: "", blurb: "", contactEmail: "" });
  const [created, setCreated] = useState<{ name: string; signupUrl: string; dashboardUrl: string; inviteCode: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/partners", { cache: "no-store" });
    if (r.ok) setItems((await r.json()).partners);
  }, []);
  useEffect(() => {
    if (user?.admin) load();
  }, [user, load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/partners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "נכשל");
      setCreated({ name: d.partner.name, signupUrl: d.signupUrl, dashboardUrl: d.dashboardUrl, inviteCode: d.partner.inviteCode });
      setForm({ name: "", kind: "bootcamp", cohort: "", blurb: "", contactEmail: "" });
      await load();
    } catch (e: any) {
      setErr(e?.message || "נכשל");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner label="טוען…" />;
  if (!user?.admin) return <SignInGate text="אזור מנהלים בלבד." />;

  return (
    <div className="jm-page space-y-6" dir="rtl">
      <PageHeader title="תוכנית שותפים" subtitle="בוטקמפים ומכללות ששולחים בוגרים. כל שותף מקבל קוד הזמנה, עמוד נחיתה ודשבורד משפך אנונימי." actions={<Link href="/AdminDashboard" className="jm-btn jm-btn-ghost jm-btn-sm">← אדמין</Link>} />

      <form onSubmit={create} className="jm-card p-5 sm:p-6 grid gap-3 sm:grid-cols-2">
        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="שם השותף (למשל ITC, Technion)" className="jm-input" />
        <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="jm-input jm-select">
          {Object.entries(KIND_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input value={form.cohort} onChange={(e) => setForm({ ...form, cohort: e.target.value })} placeholder="מחזור (אופציונלי)" className="jm-input" />
        <input value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} placeholder="אימייל איש קשר" className="jm-input" dir="ltr" />
        <textarea value={form.blurb} onChange={(e) => setForm({ ...form, blurb: e.target.value })} placeholder="משפט לעמוד הנחיתה (אופציונלי)" className="jm-input sm:col-span-2" rows={2} />
        <div className="sm:col-span-2 flex items-center gap-3">
          <button type="submit" disabled={busy} className="jm-btn jm-btn-primary">צור שותף</button>
          {err && <span className="text-sm text-red-600">{err}</span>}
        </div>
      </form>

      {created && (
        <div className="jm-alert jm-alert-ok space-y-1 text-sm">
          <div className="font-medium">{created.name} נוצר. קישור הדשבורד מוצג פעם אחת — שלח/י אותו לשותף:</div>
          <div dir="ltr">קוד: <code>{created.inviteCode}</code></div>
          <div dir="ltr">הרשמה: <code>{created.signupUrl}</code></div>
          <div dir="ltr">דשבורד: <code className="break-all">{created.dashboardUrl}</code></div>
        </div>
      )}

      {!items ? <Spinner label="טוען…" /> : items.length === 0 ? <EmptyState icon="🤝" title="עדיין אין שותפים" /> : (
        <div className="jm-card p-4 sm:p-5 overflow-x-auto">
          <table className="jm-table">
            <thead><tr><th>שותף</th><th>קוד</th><th>נרשמו</th><th>קו״ח</th><th>הגישו</th><th>ראיונות</th><th>הצעות</th><th>מדומים</th><th>פעילים 7י׳</th><th></th></tr></thead>
            <tbody>
              {items.map((p) => (
                <tr key={p._id}>
                  <td className="font-medium text-navy">{p.name} <span className="jm-muted">· {KIND_HE[p.kind] || p.kind}{p.cohort ? ` · ${p.cohort}` : ""}</span></td>
                  <td dir="ltr"><code>{p.inviteCode}</code></td>
                  <td>{p.funnel.members}</td><td>{p.funnel.withResume}</td><td>{p.funnel.applied}</td><td>{p.funnel.interviews}</td><td>{p.funnel.offers}</td><td>{p.funnel.mockInterviews}</td><td>{p.funnel.activeLast7d}</td>
                  <td><Link href={`/partners/${p.slug}`} className="text-sky hover:underline text-sm">נחיתה</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
