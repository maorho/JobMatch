"use client";
import useSWR from "swr";
import Link from "next/link";
import CompanyLogo from "./CompanyLogo";

type Row = { name: string; domain: string; logoUrl: string; jobs: number };
const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));

function Track({ rows, ariaHidden, onPick }: { rows: Row[]; ariaHidden?: boolean; onPick?: (name: string) => void }) {
  return (
    <ul className="flex items-center gap-10 shrink-0 pe-10" aria-hidden={ariaHidden}>
      {rows.map((c) => (
        <li key={c.name} className="shrink-0">
          <Link
              href={`/?company=${encodeURIComponent(c.name)}`}
              onClick={onPick ? (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); onPick(c.name); } : undefined}
              className="flex items-center gap-2.5 opacity-70 hover:opacity-100 transition-opacity"
              tabIndex={ariaHidden ? -1 : 0}
              title={`כל המשרות ב-${c.name}`}
            >
            <CompanyLogo name={c.name} domain={c.domain} logoUrl={c.logoUrl} className="h-8 w-8 rounded-lg" />
            <span className="text-sm font-medium text-navy whitespace-nowrap">{c.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** "Hiring now" strip: the catalog's biggest employers, scrolling slowly; pauses on hover. */
/** `onPick` lets the host page apply the company filter in place (a same-route query change doesn't remount the feed). */
export default function LogoMarquee({ label = "Hiring now, straight from their careers pages", onPick }: { label?: string; onPick?: (name: string) => void }) {
  const { data } = useSWR<{ companies: Row[] }>("/api/companies?limit=28", fetcher, { revalidateOnFocus: false });
  const rows = (data?.companies || []).filter((c) => c.logoUrl).slice(0, 24);
  if (rows.length < 8) return null;
  return (
    <section className="mt-10 sm:mt-14 jm-reveal">
      <p className="text-center jm-muted mb-4">{label}</p>
      <div className="jm-marquee overflow-hidden">
        <div className="jm-marquee-track flex w-max animate-marquee">
          <Track rows={rows} onPick={onPick} />
          <Track rows={rows} ariaHidden onPick={onPick} />
        </div>
      </div>
    </section>
  );
}
