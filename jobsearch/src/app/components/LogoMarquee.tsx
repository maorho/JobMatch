"use client";
import useSWR from "swr";
import Link from "next/link";
import CompanyLogo from "./CompanyLogo";

type Row = { name: string; domain: string; logoUrl: string; jobs: number };
const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));

function Track({ rows, ariaHidden }: { rows: Row[]; ariaHidden?: boolean }) {
  return (
    <ul className="flex items-center gap-10 shrink-0 pe-10" aria-hidden={ariaHidden}>
      {rows.map((c) => (
        <li key={c.name} className="shrink-0">
          <Link href={`/?company=${encodeURIComponent(c.name)}`} className="flex items-center gap-2.5 opacity-70 hover:opacity-100 transition-opacity" tabIndex={ariaHidden ? -1 : 0}>
            <CompanyLogo name={c.name} domain={c.domain} logoUrl={c.logoUrl} className="h-8 w-8 rounded-lg" />
            <span className="text-sm font-medium text-navy whitespace-nowrap">{c.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** "Hiring now" strip: the catalog's biggest employers, scrolling slowly; pauses on hover. */
export default function LogoMarquee({ label = "Hiring now, straight from their careers pages" }: { label?: string }) {
  const { data } = useSWR<{ companies: Row[] }>("/api/companies?limit=28", fetcher, { revalidateOnFocus: false });
  const rows = (data?.companies || []).filter((c) => c.logoUrl).slice(0, 24);
  if (rows.length < 8) return null;
  return (
    <section className="mt-10 sm:mt-14 jm-reveal">
      <p className="text-center jm-muted mb-4">{label}</p>
      <div className="jm-marquee overflow-hidden">
        <div className="jm-marquee-track flex w-max animate-marquee">
          <Track rows={rows} />
          <Track rows={rows} ariaHidden />
        </div>
      </div>
    </section>
  );
}
