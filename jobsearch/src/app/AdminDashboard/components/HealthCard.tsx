"use client";
import useSWR from "swr";
import { Activity } from "lucide-react";
import { useT } from "../../lib/i18n/LanguageProvider";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.status === 403 ? null : r.json()));
const Dot = ({ ok }: { ok: boolean }) => <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-teal" : "bg-red-500"}`} />;

/** Admin: is production alive? (DB, catalogue, agents, config, today's paid usage.) */
export default function HealthCard() {
  const { t } = useT();
  const { data } = useSWR<any>("/api/admin/health", fetcher, { refreshInterval: 60_000 });
  if (!data) return null;
  const c = data.checks;
  const cfg = c.config || {};
  const usageToday = Object.entries(c.usageToday || {}).filter(([, v]: any) => v.used > 0).map(([k, v]: any) => `${k} ${v.used}`).join(" · ");
  return (
    <section className="jm-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="jm-h2 inline-flex items-center gap-2"><Activity className="h-5 w-5 text-teal" /> {t("admin.health.title")}</h2>
        <span className={`jm-chip ${data.ok ? "jm-chip-teal" : "bg-red-50 text-red-700"}`}>{data.ok ? t("admin.health.allGood") : t("admin.health.needsAttention")}</span>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
        <div className="rounded-control border border-line p-3"><Dot ok={c.db?.ok} /> <b>{t("admin.health.database")}</b><div className="jm-muted">{t("admin.health.ping", { ms: c.db?.ms ?? "–" })}</div></div>
        <div className="rounded-control border border-line p-3"><Dot ok={c.catalog?.ok} /> <b>{t("admin.health.catalog")}</b><div className="jm-muted">{t("admin.health.catalogStats", { jobs: c.catalog?.jobs?.toLocaleString() ?? 0, pct: c.catalog?.embeddedPct ?? 0, n: c.catalog?.newLast24h ?? 0 })}</div></div>
        <div className="rounded-control border border-line p-3"><Dot ok={c.agents?.ok} /> <b>{t("admin.health.agents")}</b><div className="jm-muted">{t("admin.health.agentsStats", { queued: c.agents?.queued ?? 0, failed: c.agents?.failed24h ?? 0 })}{c.agents?.lastRun ? t("admin.health.lastRun", { min: c.agents.lastRun.ageMin }) : t("admin.health.noRuns")}</div></div>
        <div className="rounded-control border border-line p-3"><Dot ok={cfg.ok} /> <b>{t("admin.health.config")}</b><div className="jm-muted" dir="ltr">{["openai", "s3", "puppeteer", "googleOAuth", "whatsapp", "telegram"].map((k) => `${k}:${cfg[k] ? "✓" : "✗"}`).join(" ")} · email:{cfg.email}</div></div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-600">
        <span>{t("admin.health.users", { n: c.product?.users ?? 0 })}</span>
        <span>{t("admin.health.resolvedOutcomes", { n: c.product?.resolvedOutcomes ?? 0 })}</span>
        <span>{t("admin.health.verifiedInsiders", { n: c.product?.verifiedInsiders ?? 0 })}</span>
        <span className="jm-muted">{t("admin.health.todayUsage", { list: usageToday || t("admin.health.noPaidUsage") })}</span>
      </div>
    </section>
  );
}
