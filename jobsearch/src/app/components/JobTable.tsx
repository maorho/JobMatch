"use client";
import React, { useState, useEffect } from "react";
import JobCard from "./JobCard";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import JobsFilters from "./FilterJobs";
import LocationSelect from "./LocationSelect";
import Image from "next/image";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { EmptyState } from "./ui";
import { useIsMobile } from "../lib/hooks/useIsMobile";
import type { JobFacets } from "./FilterJobs";
import { seniorityOf, workModeOf } from "../lib/jobTaxonomy";


interface BaseJob {
  job: string;
  city: string;
  country: string;
  createdAt?: Date;
  description?: string;
  companyDomain?: string;
  logoUrl?: string;
  matchScore?: number;
}

export interface ExternalJob extends BaseJob {
  _id?: string;
  id?: string;
  company: string;
  url: string;
  skills: string[];
  seniority: string[];
  source: "external";
}

export interface InternalJob extends BaseJob {
  _id?: string;
  id?: string;
  company: {
    _id: string;
    companyName: string;
  };
  seniority: string;
  type: string;
  source: "internal";
}

export type Job = ExternalJob | InternalJob;

export function isInternalJob(job: Job): job is InternalJob {
  return job.source === "internal";
}

/**
 * Work mode for a job (On Site / Hybrid / Remote). Internal jobs carry it in
 * `type`; for external (ATS) jobs we infer it from the location/description.
 */
export function getJobType(job: Job): string {
  // Shared taxonomy — the server search classifies with the same rules.
  return isInternalJob(job)
    ? workModeOf({ type: job.type || "On Site" })
    : workModeOf({ city: job.city, country: job.country, remote: (job as any).remote === true });
}

/**
 * Seniority bucket (Intern / Junior / Mid / Senior). Uses the `seniority` field
 * (Comeet's experience_level) when present, otherwise infers from the title.
 */
export function getSeniorityLevel(job: Job): string {
  return seniorityOf(job.job, job.seniority as string[] | string | undefined);
}

function JobTable() {
  const { user } = useCurrentUser();
  const [allJobs, setAllJobs] = useState<Job[]>([]); 
  const [jobs, setJobs] = useState<Job[]>([]); 
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [company, setCompany] = useState<string[]>([]);
  const [country, setCountry] = useState<string[]>([]);
  const [city, setCity] = useState<string[]>([]);
  const [jobType, setJobType] = useState<string[]>([]);
  const [seniority, setSeniority] = useState<string[]>([]);
  const [jobCount, setJobCount] = useState(0);
  const [showmodal, setShowModal] = useState<boolean>(false);
  const isMobile = useIsMobile();
  const handleModalOpen = () => setShowModal(true);

  // Deep links: /?company=Google&q=react&city=Haifa&seniority=Junior
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const list = (k: string) => sp.getAll(k).flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
    if (sp.get("q")) setSearchTerm(sp.get("q")!);
    if (list("company").length) setCompany(list("company"));
    if (list("city").length) setCity(list("city"));
    if (list("country").length) setCountry(list("country"));
    if (list("seniority").length) setSeniority(list("seniority"));
    if (list("jobType").length) setJobType(list("jobType"));
  }, []);

  // Filter options for the WHOLE catalog (every company/city in the DB).
  const [facets, setFacets] = useState<JobFacets | null>(null);
  useEffect(() => {
    fetch("/api/jobs/facets")
      .then((r) => (r.ok ? r.json() : null))
      .then((f) => f && setFacets(f))
      .catch(() => {});
  }, []);

  // Any term or filter active → search the DB server-side instead of the page.
  const isSearching =
    searchTerm.trim() !== "" ||
    company.length > 0 ||
    country.length > 0 ||
    city.length > 0 ||
    jobType.length > 0 ||
    seniority.length > 0;

  // ✅ חיפוש בכל המאגר (פנימי + חיצוני) — לא רק במשרות שנטענו לדף
  const searchServer = async (pageNum: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set("q", searchTerm.trim());
      company.forEach((v) => params.append("company", v));
      city.forEach((v) => params.append("city", v));
      country.forEach((v) => params.append("country", v));
      jobType.forEach((v) => params.append("jobType", v));
      seniority.forEach((v) => params.append("seniority", v));
      params.set("page", String(pageNum));
      params.set("limit", "48");

      const res = await fetch(`/api/jobs/search?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to search jobs");
      const data = await res.json();
      const results: Job[] = data.jobs || [];

      if (pageNum === 1) {
        setAllJobs(results);
        setJobs(results);
      } else {
        setAllJobs((prev) => [...prev, ...results]);
        setJobs((prev) => [...prev, ...results]);
      }
      setJobCount(data.total ?? results.length);
      setTotalPages(data.pages || 1);
    } catch (err) {
      console.error("❌ Search failed:", err);
    } finally {
      setLoading(false);
    }
  };



  // ✅ מביא את המשרות מהשרת
  const fetchJobs = async (pageNum: number) => {
    try {
      setLoading(true);

      // Personalized feed (ranked by the user's résumé) for logged-in users.
      if (user) {
        try {
          const feedRes = await fetch(
            `/api/matcher/feed?page=${pageNum}&limit=48`
          );
          if (feedRes.ok) {
            const feedData = await feedRes.json();
            if (
              feedData.personalized &&
              Array.isArray(feedData.jobs) &&
              feedData.jobs.length
            ) {
              const feedJobs = feedData.jobs.map((j: Job) => ({
                ...j,
                source: "external",
              }));
              if (pageNum === 1) {
                setAllJobs(feedJobs);
                setJobs(feedJobs);
              } else {
                setAllJobs((prev) => [...prev, ...feedJobs]);
                setJobs((prev) => [...prev, ...feedJobs]);
              }
              // Catalog-wide count, not the page size.
              setJobCount(feedData.total ?? feedJobs.length);
              setTotalPages(feedData.pages || 1);
              setLoading(false);
              return;
            }
          }
        } catch {
          // fall through to the normal feed
        }
      }

      const internalUrl = user
        ? `/api/jobsDashboard/Candidate/allAnAplliedJobs?userId=${user._id}&page=${pageNum}&limit=50`
        : `/api/jobsDashboard/Alljobs?page=${pageNum}&limit=50`;

      const [resInternal, resExternal] = await Promise.all([
        fetch(internalUrl),
        fetch(`/api/external-jobs/fetch-all-external-jobs?page=${pageNum}&limit=48`),
      ]);

      const internalData = await resInternal.json();
      const externalData = await resExternal.json();

      const internalJobs = (internalData.jobs || []).map((j: Job) => ({
        ...j,
        source: "internal",
      }));
      const externalJobs = (externalData.jobs || []).map((j: Job) => ({
        ...j,
        source: "external",
      }));

      const merged = [...internalJobs, ...externalJobs];
      if (pageNum === 1) {
        setAllJobs(merged);
        setJobs(merged);
      } else {
        setAllJobs((prev) => [...prev, ...merged]);
        setJobs((prev) => [...prev, ...merged]);
      }
      // Catalog-wide count (what the DB holds), not the size of this page.
      setJobCount(
        (externalData.total ?? externalJobs.length) +
          (internalData.total ?? internalJobs.length)
      );
      setTotalPages(Math.max(internalData.pages || 1, externalData.pages || 1));
    } catch (err) {
      console.error("❌ Failed to fetch jobs:", err);
    } finally {
      setLoading(false);
    }
  };

  // One driver for all loading. Term/filter changes reset to page 1 (debounced
  // so typing doesn't fire a request per keystroke); page changes load at once.
  const searchKey = JSON.stringify({
    q: searchTerm.trim(),
    company,
    country,
    city,
    jobType,
    seniority,
    u: user?._id ?? null,
  });
  const prevKeyRef = React.useRef(searchKey);

  useEffect(() => {
    const keyChanged = prevKeyRef.current !== searchKey;
    prevKeyRef.current = searchKey;
    if (keyChanged && page !== 1) {
      setPage(1); // re-runs this effect with page 1
      return;
    }
    const run = () => (isSearching ? searchServer(page) : fetchJobs(page));
    const t = setTimeout(run, keyChanged ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchKey]);

  // "Search Jobs" button: search the whole catalog right now (no debounce).
  const handleSearch = () => {
    if (page !== 1) {
      setPage(1);
      return;
    }
    if (isSearching) searchServer(1);
    else fetchJobs(1);
  };

  // Next page of whatever is active (feed or server search) — the effect loads it.
  const loadMore = () => {
    if (page >= totalPages || loading) return;
    setPage(page + 1);
  };

  // Infinite scroll: a sentinel above the "Load More" button triggers loadMore
  // when it comes into view (400px early so the next page is usually ready
  // before the user reaches the end). `requestedPage` stops a second trigger
  // from firing in the tick between setPage and the fetch effect's `loading`.
  const loadMoreRef = React.useRef<HTMLDivElement | null>(null);
  const requestedPageRef = React.useRef(1);
  useEffect(() => {
    if (page === 1) requestedPageRef.current = 1; // filters reset the paging
    const el = loadMoreRef.current;
    if (!el || page >= totalPages) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || loading) return;
        if (requestedPageRef.current >= page + 1) return;
        requestedPageRef.current = page + 1;
        setPage(page + 1);
      },
      { rootMargin: "400px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [page, totalPages, loading]);

  const activeFilters: { label: string; clear: () => void }[] = [
    ...seniority.map((v) => ({ label: v, clear: () => setSeniority((s) => s.filter((x) => x !== v)) })),
    ...jobType.map((v) => ({ label: v, clear: () => setJobType((s) => s.filter((x) => x !== v)) })),
    ...country.map((v) => ({ label: v, clear: () => setCountry((s) => s.filter((x) => x !== v)) })),
    ...city.map((v) => ({ label: v, clear: () => setCity((s) => s.filter((x) => x !== v)) })),
    ...company.map((v) => ({ label: v, clear: () => setCompany((s) => s.filter((x) => x !== v)) })),
  ];
  const clearAll = () => {
    setSearchTerm("");
    setSeniority([]);
    setJobType([]);
    setCountry([]);
    setCity([]);
    setCompany([]);
  };
  // One-tap shortcuts under the hero search; each toggles a single filter.
  const quick = [
    { label: "Junior", on: seniority.includes("Junior"), toggle: () => setSeniority((s) => (s.includes("Junior") ? s.filter((x) => x !== "Junior") : [...s, "Junior"])) },
    { label: "Remote", on: jobType.includes("Remote"), toggle: () => setJobType((s) => (s.includes("Remote") ? s.filter((x) => x !== "Remote") : [...s, "Remote"])) },
    { label: "Hybrid", on: jobType.includes("Hybrid"), toggle: () => setJobType((s) => (s.includes("Hybrid") ? s.filter((x) => x !== "Hybrid") : [...s, "Hybrid"])) },
    { label: "Tel Aviv", on: city.includes("Tel Aviv"), toggle: () => setCity((s) => (s.includes("Tel Aviv") ? s.filter((x) => x !== "Tel Aviv") : [...s, "Tel Aviv"])) },
    { label: "Israel", on: country.includes("Israel"), toggle: () => setCountry((s) => (s.includes("Israel") ? s.filter((x) => x !== "Israel") : [...s, "Israel"])) },
  ];

  const filtersPanel = (
    <JobsFilters
      jobs={allJobs}
      facets={facets}
      company={company}
      country={country}
      city={city}
      setCompany={setCompany}
      setCountry={setCountry}
      setCity={setCity}
      jobType={jobType}
      setJobType={setJobType}
      seniority={seniority}
      setSeniority={setSeniority}
      isMobile={isMobile}
    />
  );

  return (
    <div className="jm-container pt-4 sm:pt-6">
      {/* Hero + search */}
      <section className="jm-hero px-5 py-10 sm:px-10 sm:py-14 lg:py-20">
        <Image src="/hero.jpg" alt="" fill priority className="object-cover opacity-20" sizes="100vw" />
        <div className="relative max-w-3xl mx-auto text-center">
          <span className="jm-chip bg-white/10 text-white border-white/20 mb-5">
            {jobCount > 0 ? `${jobCount.toLocaleString()} open positions` : "Fresh openings every day"}
          </span>
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05]">
            Find your dream job <span className="text-sky">in tech</span>
          </h1>
          <p className="mt-4 text-sm sm:text-lg text-white/80 max-w-xl mx-auto">
            Connect with top companies and discover opportunities that match your skills and ambitions.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="mt-7 sm:mt-9 bg-surface rounded-card p-2 flex flex-col lg:flex-row gap-2 text-ink shadow-card-hover"
          >
            <label className="relative flex-1">
              <Search className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-400 pointer-events-none" />
              <input
                className="w-full h-12 lg:h-14 ps-12 pe-4 rounded-control bg-transparent text-base placeholder:text-ink-400 focus:outline-none focus:bg-canvas"
                type="search"
                placeholder="Search jobs, companies, or keywords..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Search jobs"
              />
            </label>
            <LocationSelect jobs={allJobs} cities={facets?.cities} selectedCities={city} setSelectedCities={setCity} />
            <button type="submit" className="jm-btn jm-btn-accent h-12 lg:h-14 lg:px-8">
              Search jobs
            </button>
          </form>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {quick.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={q.toggle}
                aria-pressed={q.on}
                className={`jm-chip transition-colors ${q.on ? "bg-sky text-white border-sky" : "bg-white/10 text-white border-white/20 hover:bg-white/20"}`}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Filters + results */}
      <section className="mt-8 lg:mt-10 grid lg:grid-cols-[280px_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
        <aside className="hidden lg:block lg:sticky lg:top-[88px]">{filtersPanel}</aside>

        <div className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="jm-title">Available positions</h2>
              <p className="jm-subtitle">
                {loading && page === 1 ? "Searching the catalog…" : `Showing ${jobCount.toLocaleString()} jobs`}
                {user && !isSearching && " · ranked by your résumé"}
              </p>
            </div>
            <button type="button" onClick={handleModalOpen} className="jm-btn jm-btn-secondary jm-btn-sm lg:hidden">
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilters.length > 0 && <span className="jm-chip jm-chip-navy px-2 py-0">{activeFilters.length}</span>}
            </button>
          </div>

          {(activeFilters.length > 0 || searchTerm.trim()) && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {searchTerm.trim() && (
                <button type="button" onClick={() => setSearchTerm("")} className="jm-chip jm-chip-sky hover:bg-sky/20">
                  “{searchTerm.trim()}” <X className="h-3 w-3" />
                </button>
              )}
              {activeFilters.map((f) => (
                <button key={f.label} type="button" onClick={f.clear} className="jm-chip jm-chip-teal hover:bg-teal/20">
                  {f.label} <X className="h-3 w-3" />
                </button>
              ))}
              <button type="button" onClick={clearAll} className="text-sm text-ink-400 hover:text-navy underline-offset-2 hover:underline ms-1">
                Clear all
              </button>
            </div>
          )}

          {loading && page === 1 ? (
            <div className="mt-6 grid sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="jm-card p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="jm-skeleton h-11 w-11" />
                    <div className="flex-1 space-y-2">
                      <div className="jm-skeleton h-4 w-3/4" />
                      <div className="jm-skeleton h-3 w-1/2" />
                    </div>
                  </div>
                  <div className="jm-skeleton h-3 w-full" />
                  <div className="jm-skeleton h-3 w-5/6" />
                  <div className="flex gap-2">
                    <div className="jm-skeleton h-6 w-16 rounded-full" />
                    <div className="jm-skeleton h-6 w-20 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon="🔎"
                title="No jobs match these filters"
                text="Try fewer filters or a broader search term — the catalog is refreshed every day."
                action={
                  <button type="button" onClick={clearAll} className="jm-btn jm-btn-primary">
                    Clear filters
                  </button>
                }
              />
            </div>
          ) : (
            <>
              <div className="mt-6 grid sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
                {jobs.map((job, i) => (
                  <JobCard key={job._id || job.id || `${job.source}-${i}`} job={job} jobIndex={i} />
                ))}
              </div>

              {page < totalPages && (
                <div className="text-center mt-8">
                  {/* Scroll sentinel: when visible, the next page loads automatically. */}
                  <div ref={loadMoreRef} aria-hidden="true" className="h-px" />
                  <button className="jm-btn jm-btn-secondary" onClick={loadMore} disabled={loading}>
                    {loading ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Mobile filter sheet */}
      {showmodal && <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm z-[60] lg:hidden" onClick={() => setShowModal(false)} />}
      <div
        role="dialog"
        aria-label="Filters"
        className={`lg:hidden fixed inset-x-0 bottom-0 z-[70] bg-surface rounded-t-card shadow-card-hover
        transition-transform duration-300 ease-out ${showmodal ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <div className="w-12 h-1.5 bg-line rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
          <span className="jm-h2 mt-2">Filters</span>
          <button type="button" onClick={() => setShowModal(false)} className="jm-btn jm-btn-ghost jm-btn-icon mt-2" aria-label="Close filters">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-4 pb-4 overflow-y-auto max-h-[70vh] jm-scroll">{filtersPanel}</div>
        <div className="p-4 border-t border-line flex gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={clearAll} className="jm-btn jm-btn-secondary flex-1">Clear</button>
          <button type="button" onClick={() => setShowModal(false)} className="jm-btn jm-btn-primary flex-1">
            Show {jobCount.toLocaleString()} jobs
          </button>
        </div>
      </div>
    </div>
  );
}

export default JobTable;
