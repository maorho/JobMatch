"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useCurrentUser } from "@/app/lib/hooks/useCurrentUser";
import { PageHeader, Spinner, EmptyState, SignInGate } from "@/app/components/ui";
import { useT } from "@/app/lib/i18n/LanguageProvider";

type Funnel = { members: number; withResume: number; applied: number; applications: number; interviews: number; offers: number; mockInterviews: number; activeLast7d: number; responseRate: number | null };
type P = { _id: string; name: string; slug: string; kind: string; inviteCode: string; cohort: string; blurb: string; active: boolean; createdAt: string; landingUrl: string; signupUrl: string; funnel: Funnel };

const KIND_KEY = { bootcamp: "admin.partners.kind.bootcamp", college: "admin.partners.kind.college", community: "admin.partners.kind.community", other: "admin.partners.kind.other" } as const;

export default function AdminPartnersPage() {
  const { user, loading } = useCurrentUser();
  const { t, dir } = useT();
  const [items, setItems] = useState<P[] | null>(null);
  const [form, setForm] = useState({ name: "", kind: "bootcamp", cohort: "", blurb: "", contactEmail: "" });
  const [created, setCreated] = useState<{ name: string; signupUrl: string; dashboardUrl: string; inviteCode: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const kindLabel = (k: string) => (k in KIND_KEY ? t(KIND_KEY[k as keyof typeof KIND_KEY]) : k);

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
      if (!r.ok) throw new Error(d?.error || t("admin.failed"));
      setCreated({ name: d.partner.name, signupUrl: d.signupUrl, dashboardUrl: d.dashboardUrl, inviteCode: d.partner.inviteCode });
      setForm({ name: "", kind: "bootcamp", cohort: "", blurb: "", contactEmail: "" });
      await load();
    } catch (e: any) {
      setErr(e?.message || t("admin.failed"));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner label={t("admin.loading")} />;
  if (!user?.admin) return <SignInGate text={t("admin.adminsOnly")} />;

  return (
    <div className="jm-page space-y-6" dir={dir}>
      <PageHeader title={t("admin.partners.title")} subtitle={t("admin.partners.subtitle")} actions={<Link href="/AdminDashboard" className="jm-btn jm-btn-ghost jm-btn-sm">{t("admin.backToAdmin")}</Link>} />

      <form onSubmit={create} className="jm-card p-5 sm:p-6 grid gap-3 sm:grid-cols-2">
        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("admin.partners.namePh")} className="jm-input" />
        <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="jm-input jm-select">
          {Object.keys(KIND_KEY).map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
        </select>
        <input value={form.cohort} onChange={(e) => setForm({ ...form, cohort: e.target.value })} placeholder={t("admin.partners.cohortPh")} className="jm-input" />
        <input value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} placeholder={t("admin.partners.emailPh")} className="jm-input" dir="ltr" />
        <textarea value={form.blurb} onChange={(e) => setForm({ ...form, blurb: e.target.value })} placeholder={t("admin.partners.blurbPh")} className="jm-input sm:col-span-2" rows={2} />
        <div className="sm:col-span-2 flex items-center gap-3">
          <button type="submit" disabled={busy} className="jm-btn jm-btn-primary">{t("admin.partners.create")}</button>
          {err && <span className="text-sm text-red-600">{err}</span>}
        </div>
      </form>

      {created && (
        <div className="jm-alert jm-alert-ok space-y-1 text-sm">
          <div className="font-medium">{t("admin.partners.created", { name: created.name })}</div>
          <div>{t("admin.partners.code")}: <code dir="ltr">{created.inviteCode}</code></div>
          <div>{t("admin.partners.signup")}: <code dir="ltr">{created.signupUrl}</code></div>
          <div>{t("admin.partners.dashboard")}: <code dir="ltr" className="break-all">{created.dashboardUrl}</code></div>
        </div>
      )}

      {!items ? <Spinner label={t("admin.loading")} /> : items.length === 0 ? <EmptyState icon="🤝" title={t("admin.partners.empty")} /> : (
        <div className="jm-card p-4 sm:p-5 overflow-x-auto">
          <table className="jm-table">
            <thead><tr><th>{t("admin.partners.th.partner")}</th><th>{t("admin.partners.th.code")}</th><th>{t("admin.partners.th.members")}</th><th>{t("admin.partners.th.resume")}</th><th>{t("admin.partners.th.applied")}</th><th>{t("admin.partners.th.interviews")}</th><th>{t("admin.partners.th.offers")}</th><th>{t("admin.partners.th.mock")}</th><th>{t("admin.partners.th.active7d")}</th><th></th></tr></thead>
            <tbody>
              {items.map((p) => (
                <tr key={p._id}>
                  <td className="font-medium text-navy">{p.name} <span className="jm-muted">· {kindLabel(p.kind)}{p.cohort ? ` · ${p.cohort}` : ""}</span></td>
                  <td dir="ltr"><code>{p.inviteCode}</code></td>
                  <td>{p.funnel.members}</td><td>{p.funnel.withResume}</td><td>{p.funnel.applied}</td><td>{p.funnel.interviews}</td><td>{p.funnel.offers}</td><td>{p.funnel.mockInterviews}</td><td>{p.funnel.activeLast7d}</td>
                  <td><Link href={`/partners/${p.slug}`} className="text-sky hover:underline text-sm">{t("admin.partners.landing")}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
