"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import CompanyLogo from "../components/CompanyLogo";

type CompanyRow = {
  name: string;
  jobs: number;
  junior: number;
  remote: number;
  cities: string[];
  domain: string;
  logoUrl: string;
  careersUrl: string;
};

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));

export default function CompaniesPage() {
  const { data, isLoading } = useSWR("/api/companies", fetcher);
  const [q, setQ] = useState("");
  const [juniorOnly, setJuniorOnly] = useState(false);
  const rows: CompanyRow[] = data?.companies ?? [];

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((c) => (!term || c.name.toLowerCase().includes(term)) && (!juniorOnly || c.junior > 0));
  }, [rows, q, juniorOnly]);

  const totalJobs = rows.reduce((s, c) => s + c.jobs, 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 font-outfit" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl lg:text-[34px] font-semibold text-[#232323]">חברות שמגייסות עכשיו</h1>
          <p className="text-[#232323]/60 mt-1">
            {isLoading ? "טוען…" : `${rows.length} חברות · ${totalJobs.toLocaleString()} משרות פתוחות בישראל וב-remote, ישירות מדפי הקריירה שלהן`}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש חברה…"
            className="border border-[#232323]/15 rounded-[14px] px-4 py-3 text-sm w-full sm:w-64 focus:outline-none focus:border-[#24A8A2]"
          />
          <label className="flex items-center gap-2 text-sm text-[#232323]/80">
            <input type="checkbox" checked={juniorOnly} onChange={(e) => setJuniorOnly(e.target.checked)} className="accent-[#24A8A2]" />
            רק עם משרות ג&apos;וניור
          </label>
        </div>
      </div>

      {!isLoading && shown.length === 0 && (
        <div className="rounded-4xl border border-[#232323]/10 p-10 text-center text-[#232323]/60">לא נמצאו חברות.</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {shown.map((c) => (
          <div key={c.name} className="rounded-[24px] border border-[#232323]/10 bg-white p-5 flex flex-col gap-3 hover:shadow-md transition">
            <div className="flex items-center gap-3">
              <CompanyLogo name={c.name} domain={c.domain} logoUrl={c.logoUrl} className="w-12 h-12 flex-shrink-0 border border-[#232323]/10 p-1" />
              <div className="min-w-0">
                <h2 className="font-semibold text-[#232323] truncate" dir="auto">{c.name}</h2>
                {c.cities.length > 0 && <p className="text-xs text-[#232323]/50 truncate">{c.cities.join(" · ")}</p>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-[#F9F9F9] border border-[#232323]/10 px-3 py-1">{c.jobs} משרות</span>
              {c.junior > 0 && <span className="rounded-full bg-[#24A8A2]/10 text-[#24A8A2] px-3 py-1">{c.junior} ג&apos;וניור</span>}
              {c.remote > 0 && <span className="rounded-full bg-[#11AEFF]/10 text-[#11AEFF] px-3 py-1">{c.remote} remote</span>}
            </div>
            <div className="mt-auto flex items-center gap-3 pt-1">
              <Link href={`/?company=${encodeURIComponent(c.name)}`} className="bg-[#11AEFF] hover:bg-[#0d8ed6] text-white text-sm px-4 py-2 rounded-[14px] transition">
                צפה במשרות
              </Link>
              {c.careersUrl && (
                <a href={c.careersUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[#232323]/60 hover:underline">
                  דף קריירה ↗
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
