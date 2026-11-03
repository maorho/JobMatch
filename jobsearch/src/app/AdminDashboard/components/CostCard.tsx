"use client";
import useSWR from "swr";
import { Wallet } from "lucide-react";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.status === 403 ? null : r.json()));
const usd = (n: number) => `$${(n ?? 0).toFixed(2)}`;

/** Admin: what the AI spends — today against the alert line and the hard cap, where it goes, and who spends it. */
export default function CostCard() {
  const { data } = useSWR<any>("/api/admin/costs", fetcher, { refreshInterval: 60_000 });
  if (!data) return null;
  const lim = data.limits || {};
  const pct = lim.hardCap ? Math.min(100, Math.round((data.today / lim.hardCap) * 100)) : 0;
  const tone = data.breaches?.length ? "bg-red-50 text-red-700" : data.today >= lim.daily * 0.7 ? "bg-amber-50 text-amber-700" : "jm-chip-teal";
  return (
    <section className="jm-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="jm-h2 inline-flex items-center gap-2"><Wallet className="h-5 w-5 text-teal" /> AI spend</h2>
        <span className={`jm-chip ${tone}`}>{data.breaches?.length ? `${data.breaches.length} alert${data.breaches.length === 1 ? "" : "s"}` : "within limits"}</span>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 text-sm">
        <div className="rounded-control border border-line p-3"><div className="jm-muted">Today</div><div className="text-xl font-semibold text-navy">{usd(data.today)}</div><div className="jm-muted">alert at {usd(lim.daily)} · cap {usd(lim.hardCap)}</div></div>
        <div className="rounded-control border border-line p-3"><div className="jm-muted">Last hour</div><div className="text-xl font-semibold text-navy">{usd(data.lastHour)}</div><div className="jm-muted">alert at {usd(lim.hourly)}</div></div>
        <div className="rounded-control border border-line p-3"><div className="jm-muted">Yesterday</div><div className="text-xl font-semibold text-navy">{usd(data.yesterday)}</div></div>
        <div className="rounded-control border border-line p-3"><div className="jm-muted">7 days</div><div className="text-xl font-semibold text-navy">{usd(data.last7d)}</div></div>
        <div className="rounded-control border border-line p-3"><div className="jm-muted">30 days</div><div className="text-xl font-semibold text-navy">{usd(data.last30d)}</div>{data.estimatedShare > 0 && <div className="jm-muted">{Math.round(data.estimatedShare * 100)}% of today at fallback prices</div>}</div>
      </div>
      <div className="h-2 w-full rounded-full bg-line overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="today against the hard cap">
        <div className={`h-full rounded-full ${pct >= 100 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-teal"}`} style={{ width: `${pct}%` }} />
      </div>
      {data.breaches?.length > 0 && (
        <ul className="jm-alert jm-alert-err text-sm space-y-1">{data.breaches.map((b: any, i: number) => <li key={i}><b>{b.kind}</b>: {b.detail}</li>)}</ul>
      )}
      <div className="grid md:grid-cols-3 gap-4 text-sm">
        <div>
          <div className="font-semibold text-navy mb-1">By model (7d)</div>
          <ul className="space-y-0.5">{(data.byModel || []).map((m: any) => <li key={m.model} className="flex justify-between gap-2"><span className="truncate" dir="ltr">{m.model}</span><span className="tabular-nums">{usd(m.usd)} · {m.calls}</span></li>)}</ul>
        </div>
        <div>
          <div className="font-semibold text-navy mb-1">By feature (7d)</div>
          <ul className="space-y-0.5">{(data.byFeature || []).map((f: any) => <li key={f.feature} className="flex justify-between gap-2"><span className="truncate" dir="ltr">{f.feature}</span><span className="tabular-nums">{usd(f.usd)} · {f.calls}</span></li>)}</ul>
        </div>
        <div>
          <div className="font-semibold text-navy mb-1">Top users (today)</div>
          <ul className="space-y-0.5">{(data.topUsers || []).length ? data.topUsers.map((u: any) => <li key={u.userId} className="flex justify-between gap-2"><span className="truncate font-mono text-xs" dir="ltr">{u.userId}</span><span className="tabular-nums">{usd(u.usd)} · {u.calls}</span></li>) : <li className="jm-muted">nothing tagged to a user yet</li>}</ul>
        </div>
      </div>
      <div className="jm-muted">{data.busMessagesLastHour} agent messages in the last hour (storm alert at {lim.busStorm}).</div>
    </section>
  );
}
