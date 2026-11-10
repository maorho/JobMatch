"use client";
import { useT } from "@/app/lib/i18n/LanguageProvider";

export type Funnel = { members: number; withResume: number; applied: number; interviews: number; offers: number; applications: number; mockInterviews: number; activeLast7d: number; responseRate: number | null };
type Props = { partner: { name: string; cohort?: string; inviteCode: string } | null; funnel: Funnel | null };

/** The partner's cohort funnel (client, so it follows the interface language). */
export default function PartnerDashboardView({ partner, funnel: f }: Props) {
  const { t, dir } = useT();
  if (!partner || !f) {
    return (
      <div className="jm-page" dir={dir}>
        <div className="jm-card p-8 text-center space-y-2">
          <div className="text-3xl">🔒</div>
          <p className="text-ink-600">{t("admin.pd.badLink")}</p>
        </div>
      </div>
    );
  }
  const pct = (n: number) => (f.members ? `${Math.round((n / f.members) * 100)}%` : "–");
  const rows: [string, number, string][] = [
    [t("admin.pd.r1"), f.members, ""],
    [t("admin.pd.r2"), f.withResume, pct(f.withResume)],
    [t("admin.pd.r3"), f.applied, pct(f.applied)],
    [t("admin.pd.r4"), f.interviews, pct(f.interviews)],
    [t("admin.pd.r5"), f.offers, pct(f.offers)],
  ];
  const tiles: [string, number][] = [[t("admin.pd.applications"), f.applications], [t("admin.pd.mocks"), f.mockInterviews], [t("admin.pd.active7d"), f.activeLast7d]];
  return (
    <div className="jm-page" dir={dir}>
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-teal mb-2">{t("admin.pd.eyebrow")} · {partner.name}{partner.cohort ? ` · ${partner.cohort}` : ""}</div>
        <h1 className="jm-title">{t("admin.pd.title")}</h1>
        <p className="jm-subtitle">{t("admin.pd.subtitle")} <code dir="ltr">{partner.inviteCode}</code></p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        {tiles.map(([l, v]) => (
          <div key={l} className="jm-card p-5">
            <div className="text-3xl font-semibold text-navy leading-none">{v}</div>
            <div className="jm-muted mt-2">{l}</div>
          </div>
        ))}
      </div>
      <div className="jm-card p-5 sm:p-6">
        <h2 className="jm-h2 mb-3">{t("admin.pd.funnel")}</h2>
        <table className="jm-table">
          <thead><tr><th>{t("admin.pd.stage")}</th><th>{t("admin.pd.people")}</th><th>{t("admin.pd.ofSignups")}</th></tr></thead>
          <tbody>{rows.map(([l, n, p]) => <tr key={l}><td className="font-medium text-navy">{l}</td><td>{n}</td><td className="text-ink-600">{p}</td></tr>)}</tbody>
        </table>
        {f.responseRate !== null && <p className="jm-muted mt-3">{t("admin.pd.responseRate", { pct: f.responseRate })}</p>}
      </div>
    </div>
  );
}
