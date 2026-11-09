"use client";
import React from "react";
import {ChevronDown} from "lucide-react";
import { Job, getJobType, getSeniorityLevel } from "./JobTable";
import { POSTED_WINDOWS } from "../lib/jobTaxonomy";
import { useT } from "../lib/i18n/LanguageProvider";

/** One choice out of a few (radio), with "Any time" to clear: the "Posted" filter. */
const ChoiceRender: React.FC<{ title: string; options: { value: string; label: string }[]; selected: string; setSelected: (v: string) => void; anyLabel: string; defaultOpen?: boolean }> = ({ title, options, selected, setSelected, anyLabel, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = React.useState<boolean>(defaultOpen);
  const id = `filter-${title.toLowerCase().replace(/\s+/g, "-")}`;
  const current = options.find((o) => o.value === selected);
  return (
    <div className="border-b border-line">
      <button type="button" onClick={() => setIsOpen((o) => !o)} aria-expanded={isOpen} aria-controls={id} className="w-full flex items-center justify-between gap-2 text-start py-4 min-h-[56px]">
        <span className="font-semibold text-navy text-[15px]">
          {title}
          {current && <span className="ms-2 jm-chip jm-chip-teal px-2 py-0">1</span>}
          {!isOpen && current && <span className="block mt-0.5 text-xs font-normal text-ink-400 truncate max-w-[260px]">{current.label}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 text-ink-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
        <div id={id} className="pb-4 space-y-0.5" role="radiogroup" aria-label={title}>
          {[{ value: "", label: anyLabel }, ...options].map((o) => (
            <label key={o.value || "any"} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-canvas cursor-pointer text-sm text-ink-600">
              <input type="radio" name={id} checked={selected === o.value} onChange={() => setSelected(o.value)} className="h-4 w-4 accent-teal" />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

interface FilterRenderProps {
  title: string;
  options: string[];
  selected: string[];
  setSelected: (values: string[]) => void;
  /** Lists longer than this get a search box and a scroll area. */
  searchable?: boolean;
  defaultOpen?: boolean;
  /** Display text per option value (values stay as the API expects them). */
  labels?: Record<string, string>;
}

const FilterRender: React.FC<FilterRenderProps> = ({ title, options, selected, setSelected, searchable, defaultOpen = true, labels }) => {
  const [isOpen, setIsOpen] = React.useState<boolean>(defaultOpen);
  const [q, setQ] = React.useState("");
  const { t } = useT();
  const toggleElement = (value: string) => {
    if (selected.includes(value)) setSelected(selected.filter((v) => v !== value));
    else setSelected([...selected, value]);
  };
  const needle = q.trim().toLowerCase();
  // Selected values stay visible at the top even when the search hides them.
  const visible = needle ? options.filter((o) => o.toLowerCase().includes(needle) || selected.includes(o)) : options;
  const id = `filter-${title.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className="border-b border-line">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        aria-expanded={isOpen}
        aria-controls={id}
        className="w-full flex items-center justify-between gap-2 text-start py-4 min-h-[56px]"
      >
        <span className="font-semibold text-navy text-[15px]">
          {title}
          {selected.length > 0 && <span className="ms-2 jm-chip jm-chip-teal px-2 py-0">{selected.length}</span>}
          {!isOpen && selected.length > 0 && <span className="block mt-0.5 text-xs font-normal text-ink-400 truncate max-w-[260px]">{selected.map((v) => labels?.[v] ?? v).join(", ")}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 text-ink-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div id={id} className="pb-4 space-y-1">
          {searchable && options.length > 8 && (
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("filters.search", { what: title })}
              className="jm-input py-2 text-sm mb-2"
              aria-label={t("filters.search", { what: title })}
            />
          )}
          <div className={`space-y-0.5 ${searchable ? "max-h-56 overflow-y-auto jm-scroll pe-1" : ""}`}>
            {visible.length === 0 && <p className="jm-muted py-1">{t("filters.noMatches")}</p>}
            {visible.map((value) => (
              <label key={value} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-canvas cursor-pointer text-sm text-ink-600">
                <input
                  type="checkbox"
                  checked={selected.includes(value)}
                  onChange={() => toggleElement(value)}
                  className="h-4 w-4 accent-teal rounded"
                />
                <span className="truncate" title={labels?.[value] ?? value}>
                  {labels?.[value] ?? value}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/** Filter options computed server-side over the whole catalog (/api/jobs/facets). */
export interface JobFacets {
  companies: string[];
  cities: string[];
  countries: string[];
  jobTypes: string[];
  seniority: string[];
  /** Technologies named in open postings, most common first (lib/jobs/enrich.ts). */
  tech?: string[];
  /** Years-of-experience buckets on the required minimum. */
  experience?: { key: string; label: string }[];
}

interface JobFiltersProps {
  jobs: Job[];
  /** When provided, options come from the DB-wide facets instead of `jobs`. */
  facets?: JobFacets | null;
  company: string[];
  country: string[];
  city: string[];
  jobType: string[];
  seniority: string[];
  /** "Posted within" in days ("" = any time); see lib/jobs/posted.ts. */
  posted: string;
  setPosted: (v: string) => void;
  /** Experience buckets ("0-2", "3-5", "5-10", "10+") and technologies, from lib/jobs/enrich.ts. */
  experience: string[];
  setExperience: React.Dispatch<React.SetStateAction<string[]>>;
  tech: string[];
  setTech: React.Dispatch<React.SetStateAction<string[]>>;
  setCompany: React.Dispatch<React.SetStateAction<string[]>>;
  setCountry: React.Dispatch<React.SetStateAction<string[]>>;
  setCity: React.Dispatch<React.SetStateAction<string[]>>;
  setJobType: React.Dispatch<React.SetStateAction<string[]>>;
  setSeniority: React.Dispatch<React.SetStateAction<string[]>>;
}

export const JobsFilters: React.FC<JobFiltersProps> = ({
  jobs,
  facets,
  company,
  country,
  city,
  jobType,
  seniority,
  posted,
  setPosted,
  experience,
  setExperience,
  tech,
  setTech,
  setCompany,
  setCountry,
  setCity,
  setJobType,
  setSeniority,
}) => {
  const { t } = useT();
  const getUniqueValues = (arr: Job[], key: keyof Job) => {
    const values = arr
      .map((job) => {
        if (key === "company") {
          return typeof job.company === "object" ? job.company.companyName : job.company;
        }
        return job[key] as unknown as string;
      })
      .filter((value): value is string => typeof value === "string" && value.trim() !== "");
    return Array.from(new Set(values));
  };
  // Prefer DB-wide facets (every company/city in the catalog); fall back to
  // deriving from the loaded jobs while they are still loading.
  const uniqueCompanies = facets?.companies ?? getUniqueValues(jobs, "company");
  const uniqueCountries = facets?.countries ?? getUniqueValues(jobs, "country");
  const uniqueCities = facets?.cities ?? getUniqueValues(jobs, "city");
  const uniqueJobTypes = facets?.jobTypes ?? Array.from(new Set(jobs.map(getJobType))).filter(Boolean);
  const seniorityOrder = ["Intern", "Junior", "Mid", "Senior"];
  const presentSeniority = new Set(facets?.seniority ?? jobs.map(getSeniorityLevel));
  const uniqueSeniority = seniorityOrder.filter((s) => presentSeniority.has(s));
  return (
    <div className="w-full">
      {/* Posted within: the freshest postings first, still ranked by match */}
      <ChoiceRender title={t("filters.posted")} options={POSTED_WINDOWS.map((w) => ({ value: String(w.days), label: t(`posted.${w.days}` as any) }))} selected={posted} setSelected={setPosted} anyLabel={t("filters.anyTime")} />
      {/* Years of experience required, read from the description (not the title) */}
      <FilterRender title={t("filters.experience")} options={(facets?.experience ?? []).map((b) => b.key)} labels={Object.fromEntries((facets?.experience ?? []).map((b) => [b.key, t(`exp.${b.key}` as any)]))} selected={experience} setSelected={setExperience} defaultOpen={false} />
      {/* Technologies named in the posting */}
      <FilterRender title={t("filters.tech")} options={facets?.tech ?? []} selected={tech} setSelected={setTech} searchable defaultOpen={false} />
      {/* Seniority (Intern / Junior / Mid / Senior) */}
      <FilterRender title={t("filters.seniority")} options={uniqueSeniority} labels={Object.fromEntries(uniqueSeniority.map((v) => [v, t(`level.${v}` as any)]))} selected={seniority} setSelected={setSeniority} defaultOpen={false} />
      {/* Work mode (On Site / Hybrid / Remote) */}
      <FilterRender title={t("filters.jobType")} options={uniqueJobTypes} labels={Object.fromEntries(uniqueJobTypes.map((v) => [v, t(`mode.${v}` as any)]))} selected={jobType} setSelected={setJobType} defaultOpen={false} />
      <FilterRender title={t("filters.country")} options={uniqueCountries} selected={country} setSelected={setCountry} searchable defaultOpen={false} />
      <FilterRender title={t("filters.cities")} options={uniqueCities} selected={city} setSelected={setCity} searchable defaultOpen={false} />
      <FilterRender title={t("filters.companies")} options={uniqueCompanies} selected={company} setSelected={setCompany} searchable defaultOpen={false} />
    </div>
  );
};

export default JobsFilters;
