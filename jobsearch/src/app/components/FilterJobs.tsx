"use client";
import React from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Job, getJobType, getSeniorityLevel } from "./JobTable";

interface FilterRenderProps {
  title: string;
  options: string[];
  selected: string[];
  setSelected: (values: string[]) => void;
  /** Lists longer than this get a search box and a scroll area. */
  searchable?: boolean;
  defaultOpen?: boolean;
}

const FilterRender: React.FC<FilterRenderProps> = ({ title, options, selected, setSelected, searchable, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = React.useState<boolean>(defaultOpen);
  const [q, setQ] = React.useState("");
  const toggleElement = (value: string) => {
    if (selected.includes(value)) setSelected(selected.filter((v) => v !== value));
    else setSelected([...selected, value]);
  };
  const needle = q.trim().toLowerCase();
  // Selected values stay visible at the top even when the search hides them.
  const visible = needle ? options.filter((o) => o.toLowerCase().includes(needle) || selected.includes(o)) : options;
  const id = `filter-${title.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className="py-4 border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        aria-expanded={isOpen}
        aria-controls={id}
        className="w-full flex items-center justify-between gap-2 text-start"
      >
        <span className="font-semibold text-navy">
          {title}
          {selected.length > 0 && <span className="ms-2 jm-chip jm-chip-teal px-2 py-0">{selected.length}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 text-ink-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div id={id} className="mt-3 space-y-1">
          {searchable && options.length > 8 && (
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${title.toLowerCase()}…`}
              className="jm-input py-2 text-sm mb-2"
              aria-label={`Search ${title}`}
            />
          )}
          <div className={`space-y-0.5 ${searchable ? "max-h-56 overflow-y-auto jm-scroll pe-1" : ""}`}>
            {visible.length === 0 && <p className="jm-muted py-1">No matches</p>}
            {visible.map((value) => (
              <label key={value} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-canvas cursor-pointer text-sm text-ink-600">
                <input
                  type="checkbox"
                  checked={selected.includes(value)}
                  onChange={() => toggleElement(value)}
                  className="h-4 w-4 accent-teal rounded"
                />
                <span className="truncate" title={value}>
                  {value}
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
  setCompany: React.Dispatch<React.SetStateAction<string[]>>;
  setCountry: React.Dispatch<React.SetStateAction<string[]>>;
  setCity: React.Dispatch<React.SetStateAction<string[]>>;
  setJobType: React.Dispatch<React.SetStateAction<string[]>>;
  setSeniority: React.Dispatch<React.SetStateAction<string[]>>;
  isMobile: boolean;
}

export const JobsFilters: React.FC<JobFiltersProps> = ({
  jobs,
  facets,
  company,
  country,
  city,
  jobType,
  seniority,
  setCompany,
  setCountry,
  setCity,
  setJobType,
  setSeniority,
  isMobile,
}) => {
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
  const total = seniority.length + jobType.length + country.length + city.length + company.length;

  return (
    <div className={isMobile ? "w-full" : "jm-card p-5 w-full"}>
      {!isMobile && (
        <div className="flex items-center justify-between pb-1">
          <span className="jm-h2 inline-flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-teal" />
            Filters
          </span>
          {total > 0 && (
            <button
              type="button"
              onClick={() => {
                setSeniority([]);
                setJobType([]);
                setCountry([]);
                setCity([]);
                setCompany([]);
              }}
              className="text-sm text-ink-400 hover:text-navy"
            >
              Clear ({total})
            </button>
          )}
        </div>
      )}
      {/* Seniority (Intern / Junior / Mid / Senior) */}
      <FilterRender title="Seniority" options={uniqueSeniority} selected={seniority} setSelected={setSeniority} />
      {/* Work mode (On Site / Hybrid / Remote) */}
      <FilterRender title="Job Type" options={uniqueJobTypes} selected={jobType} setSelected={setJobType} />
      <FilterRender title="Country" options={uniqueCountries} selected={country} setSelected={setCountry} searchable />
      <FilterRender title="Cities" options={uniqueCities} selected={city} setSelected={setCity} searchable defaultOpen={false} />
      <FilterRender title="Companies" options={uniqueCompanies} selected={company} setSelected={setCompany} searchable defaultOpen={false} />
    </div>
  );
};

export default JobsFilters;
