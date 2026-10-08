"use client";
import React, { useEffect, useRef, useState } from "react";
import { MapPin, ChevronDown } from "lucide-react";
import type { Job } from "./JobTable";

interface LocationSelectProps {
  jobs: Job[];
  /** DB-wide city list (/api/jobs/facets); falls back to the loaded jobs. */
  cities?: string[] | null;
  selectedCities: string[];
  setSelectedCities: React.Dispatch<React.SetStateAction<string[]>>;
}

export default function LocationSelect({ jobs, cities, selectedCities, setSelectedCities }: LocationSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);

  // ערים ייחודיות בלבד — מכל המאגר כשיש facets, אחרת מהמשרות שנטענו
  const uniqueCities = cities ?? [...new Set(jobs.map((job) => job.city).filter(Boolean))];
  const needle = q.trim().toLowerCase();
  const visible = needle ? uniqueCities.filter((c) => c.toLowerCase().includes(needle) || selectedCities.includes(c)) : uniqueCities;

  const toggleCity = (city: string) => {
    setSelectedCities((prev) => (prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city]));
  };

  // Close on outside click / Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setIsOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setIsOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  const label = selectedCities.length === 0 ? "Location" : selectedCities.length === 1 ? selectedCities[0] : `${selectedCities[0]} +${selectedCities.length - 1}`;

  return (
    <div className="relative lg:w-56" ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="w-full h-12 lg:h-14 flex items-center gap-2 ps-4 pe-3 rounded-control bg-canvas lg:bg-transparent hover:bg-canvas text-start transition-colors"
      >
        <MapPin className="h-5 w-5 text-ink-400 shrink-0" />
        <span className={`flex-1 truncate text-base ${selectedCities.length ? "text-ink" : "text-ink-400"}`}>{label}</span>
        <ChevronDown className={`h-4 w-4 text-ink-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full start-0 mt-2 w-full min-w-[260px] jm-card p-2 z-50 text-start">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search city…"
            className="jm-input py-2 text-sm mb-2"
            aria-label="Search city"
          />
          <div role="listbox" aria-multiselectable className="max-h-56 overflow-y-auto jm-scroll space-y-0.5">
            {visible.length === 0 && <p className="jm-muted px-2 py-1">No matches</p>}
            {visible.map((city) => (
              <label key={city} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-canvas cursor-pointer text-sm text-ink-600">
                <input type="checkbox" checked={selectedCities.includes(city)} onChange={() => toggleCity(city)} className="h-4 w-4 accent-teal" />
                <span className="truncate">{city}</span>
              </label>
            ))}
          </div>
          {selectedCities.length > 0 && (
            <button type="button" onClick={() => setSelectedCities([])} className="mt-2 w-full jm-btn jm-btn-ghost jm-btn-sm">
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
