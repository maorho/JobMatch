"use client";
import { useState } from "react";
import useSWR from "swr";
import { Target } from "lucide-react";

type Profile = { roles: string[]; level?: string; cities: string[]; workModes: string[]; keywords: string[] };
type Data = { profile: Profile; options: { roles: { key: string; label: string; en: string }[]; levels: string[]; workModes: string[] } };
const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
const LEVEL_HE: Record<string, string> = { junior: "ג'וניור (0–2 שנים)", mid: "Mid (3–5)", senior: "סניור (5+)" };
const MODE_HE: Record<string, string> = { Remote: "מרחוק", Hybrid: "היברידי", "On Site": "במשרד" };
const CITY_OPTIONS = ["Tel Aviv", "Herzliya", "Petah Tikva", "Ramat Gan", "Haifa", "Jerusalem", "Beer Sheva", "Netanya", "Raanana", "Rehovot"];

/** "What I'm looking for": the few answers that turn a résumé-only feed into a precise one. */
export default function SearchProfileCard({ onSaved, compact }: { onSaved?: (p: Profile) => void; compact?: boolean }) {
  const { data, mutate } = useSWR<Data>("/api/settings/search-profile", fetcher, { revalidateOnFocus: false });
  const [edits, setEdits] = useState<Profile | null>(null);
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  if (!data) return <p className="jm-muted">טוען…</p>;
  const p: Profile = edits ?? data.profile;
  const setP = (next: Profile | ((cur: Profile) => Profile)) => setEdits(typeof next === "function" ? next(p) : next);

  const toggle = (key: keyof Profile, v: string, max = 99) =>
    setP((cur) => {
      const arr = (cur[key] as string[]) || [];
      const next = arr.includes(v) ? arr.filter((x) => x !== v) : arr.length >= max ? arr : [...arr, v];
      return { ...cur, [key]: next };
    });
  const save = async () => {
    setBusy(true);
    const r = await fetch("/api/settings/search-profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
    const j = await r.json().catch(() => null);
    setBusy(false);
    if (j?.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      mutate();
      onSaved?.(j.profile);
    }
  };
  const chip = (on: boolean) => `jm-chip cursor-pointer select-none transition-colors ${on ? "bg-navy text-white" : "hover:bg-band-200 hover:bg-teal-50"}`;

  return (
    <div className="space-y-4">
      {!compact && (
        <p className="text-sm text-ink-600 leading-relaxed">
          הקו״ח אומר מה עשית. זה אומר מה את/ה רוצה. הפיד מסנן לפי זה בקשיחות: תפקידים אחרים, רמה לא מתאימה ומקומות לא רלוונטיים פשוט לא יופיעו.
        </p>
      )}
      <div>
        <div className="jm-label">תפקיד (עד 3)</div>
        <div className="flex flex-wrap gap-1.5">{data.options.roles.map((r) => <button key={r.key} type="button" onClick={() => toggle("roles", r.key, 3)} className={chip(p.roles.includes(r.key))}>{r.label}</button>)}</div>
      </div>
      <div>
        <div className="jm-label">רמה</div>
        <div className="flex flex-wrap gap-1.5">{data.options.levels.map((l) => <button key={l} type="button" onClick={() => setP({ ...p, level: p.level === l ? undefined : l })} className={chip(p.level === l)}>{LEVEL_HE[l] || l}</button>)}</div>
      </div>
      <div>
        <div className="jm-label">איפה</div>
        <div className="flex flex-wrap gap-1.5">
          {data.options.workModes.map((m) => <button key={m} type="button" onClick={() => toggle("workModes", m)} className={chip(p.workModes.includes(m))}>{MODE_HE[m] || m}</button>)}
          <span className="w-px bg-line mx-1" />
          {CITY_OPTIONS.map((c) => <button key={c} type="button" onClick={() => toggle("cities", c, 8)} className={chip(p.cities.includes(c))}>{c}</button>)}
        </div>
        <p className="jm-muted mt-1">בלי בחירה = הכול. &quot;מרחוק&quot; מתאים גם אם לא נבחרה עיר.</p>
      </div>
      <div>
        <div className="jm-label">מילות מפתח (טכנולוגיות, תחומים, כותרות)</div>
        <div className="flex flex-wrap gap-1.5 mb-2">{p.keywords.map((k) => <button key={k} type="button" onClick={() => toggle("keywords", k)} className="jm-chip jm-chip-teal cursor-pointer" title="הסר">{k} ×</button>)}</div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const k = keyword.trim();
            if (k && !p.keywords.includes(k) && p.keywords.length < 12) setP({ ...p, keywords: [...p.keywords, k] });
            setKeyword("");
          }}
          className="flex gap-2"
        >
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="React, Python, fintech, data…" className="jm-input py-2 text-sm" dir="ltr" />
          <button type="submit" className="jm-btn jm-btn-secondary jm-btn-sm">הוסף</button>
        </form>
      </div>
      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={save} disabled={busy} className="jm-btn jm-btn-primary"><Target className="h-4 w-4" /> {busy ? "שומר…" : "שמור וכוון את הפיד"}</button>
        {saved && <span className="text-sm text-teal">נשמר. הפיד מסודר מחדש.</span>}
      </div>
    </div>
  );
}
