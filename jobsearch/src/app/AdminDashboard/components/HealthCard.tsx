"use client";
import useSWR from "swr";
import { Activity } from "lucide-react";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.status === 403 ? null : r.json()));
const Dot = ({ ok }: { ok: boolean }) => <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-teal" : "bg-red-500"}`} />;

/** Admin: is production alive? (DB, catalogue, agents, config, today's paid usage.) */
export default function HealthCard() {
  const { data } = useSWR<any>("/api/admin/health", fetcher, { refreshInterval: 60_000 });
  if (!data) return null;
  const c = data.checks;
  const cfg = c.config || {};
  return (
    <section className="jm-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="jm-h2 inline-flex items-center gap-2"><Activity className="h-5 w-5 text-teal" /> System health</h2>
        <span className={`jm-chip ${data.ok ? "jm-chip-teal" : "bg-red-50 text-red-700"}`}>{data.ok ? "all good" : "needs attention"}</span>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
        <div className="rounded-control border border-line p-3"><Dot ok={c.db?.ok} /> <b>Database</b><div className="jm-muted">ping {c.db?.ms} ms</div></div>
        <div className="rounded-control border border-line p-3"><Dot ok={c.catalog?.ok} /> <b>Catalog</b><div className="jm-muted">{c.catalog?.jobs?.toLocaleString()} jobs · {c.catalog?.embeddedPct}% embedded · {c.catalog?.newLast24h} new today</div></div>
        <div className="rounded-control border border-line p-3"><Dot ok={c.agents?.ok} /> <b>Agents</b><div className="jm-muted">{c.agents?.queued} queued · {c.agents?.failed24h} failed (24h){c.agents?.lastRun ? ` · last run ${c.agents.lastRun.ageMin} min ago` : " · no runs yet"}</div></div>
        <div className="rounded-control border border-line p-3"><Dot ok={cfg.ok} /> <b>Config</b><div className="jm-muted">{["openai", "s3", "puppeteer", "googleOAuth", "whatsapp", "telegram"].map((k) => `${k}:${cfg[k] ? "✓" : "✗"}`).join(" ")} · email:{cfg.email}</div></div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-600">
        <span>{c.product?.users} users</span>
        <span>{c.product?.resolvedOutcomes} resolved outcomes</span>
        <span>{c.product?.verifiedInsiders} verified insiders</span>
        <span className="jm-muted">Today: {Object.entries(c.usageToday || {}).filter(([, v]: any) => v.used > 0).map(([k, v]: any) => `${k} ${v.used}`).join(" · ") || "no paid usage yet"}</span>
      </div>
    </section>
  );
}
