"use client";
import React, { useState, useEffect } from "react";
import JobCard from "./JobCard";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import JobsFilters from "./FilterJobs";
import { FilterIcon, SearchIcon, WhiteFilterIcon } from "./icons";
import LocationSelect from "./LocationSelect";
import { HeroImg } from "./HeroImages";
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
    : workModeOf({ city: job.city, country: job.country, description: job.description });
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


  return (
    <div className="w-screen items-center mx-auto justify-center">
      <div id="HeroSection" className="relative w-full max-w-[1440px] mx-auto mt-10">
        <HeroImg />
        <div className="font-outfit inset-0 flex flex-col absolute text-white items-center justify-center text-center px-4">
          <label className="text-4xl lg:text-7xl">
            Find Your Dream Job <br /> in Tech
          </label>
          <p className="mt-[40px]">
            Connect with top companies and discover opportunities that match your skills and ambitions
          </p>

          <div className="backdrop-blur-md lg:backdrop-blur-0 border border-white lg:border-0 p-2 lg:p-0 rounded-2xl mt-[40px] flex flex-col lg:flex-row items-center justify-center gap-5">
            <div className="relative w-full">
              <input
                className="bg-white w-full py-[23px] pl-12 lg:pl-10 rounded-[14px] lg:w-[525px] h-[58px] text-[#232323]"
                type="text"
                placeholder="Search jobs, companies, or keywords..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <SearchIcon />
            </div>
            <div className="flex flex-row gap-4 items-center">
              <LocationSelect
                jobs={allJobs}
                cities={facets?.cities}
                selectedCities={city}
                setSelectedCities={setCity}
              />
              <button
                onClick={handleSearch}
                className="bg-[#11AEFF] px-12 py-3.5 lg:px-20 lg:py-4 rounded-[14px] whitespace-nowrap w-fit lg:text-[16px] text-[12px]"
              >
                Search Jobs
              </button>
              <div className="flex flex-row gap-4 items-center">
                {/* חיפוש גלובלי */}
               
              </div>
            </div>
          </div>
        </div>
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 text-center lg:left-40 lg:w-[230px] lg:transform-none lg:text-left w-fit">
          <p className="text-white text-[14px] lg:text-[18px]">
            Job Match has a collection of +1000 high-end Jobs
          </p>
        </div>
      </div>

      {loading && page === 1 ? (
        <p className="text-center mt-4">Loading jobs...</p>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col lg:flex-row lg:items-start items-center justify-center mx-auto lg:max-w-4/5 px-4 gap-5 mt-10">
            {!isMobile ? (
              <div className="block md:hidden lg:block">
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
              </div>
            ) : (
              <div>
                <button
                  onClick={handleModalOpen}
                  className="bg-[#24A8A2] max-w-72 flex gap-20 rounded-[20px] p-5 hover:bg-[#11AEFF]"
                >
                  <label className="mb-1 text-white font-outfit font-medium text-[20px]">
                    Filters and Sort
                  </label>
                  <FilterIcon />
                </button>
              </div>
            )}
        </div>
      ) : (
        <>
          <div className="flex flex-col lg:flex-row lg:items-start items-center justify-center mx-auto lg:max-w-4/5 px-4 gap-5 mt-10">
            {!isMobile ? (
              <div className="block md:hidden lg:block">
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
              </div>
            ) : (
              <div>
                <button
                  onClick={handleModalOpen}
                  className="bg-[#24A8A2] max-w-72 max-h-16 flex gap-20 rounded-[20px] p-5 hover:bg-[#11AEFF]"
                >
                  <label className="text-white font-outfit font-medium text-[18px]">
                    Filters and Sort
                  </label>
                  <WhiteFilterIcon />
                </button>
              </div>
            )}

            <div className="flex-1">
              <div className="flex flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <label className="font-outfit text-2xl lg:text-[34px] font-semibold">
                    Available Positions
                  </label>
                  <p className="lg:text-[16px] text-[12px] mt-2 text-[#232323]">
                    Showing {jobCount} jobs 
                  </p>
                </div>

                <div>
                  <select className="border border-[#232323]/50 rounded-[14px] py-3 px-4 text-[#232323] font-outfit w-full sm:w-auto">
                    <option>Newest First</option>
                    <option>Least Applications</option>
                    <option>Most Popular</option>
                  </select>
                </div>
              </div>

              <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {jobs.map((job, i) => (
                  <JobCard
                    key={job._id || job.id || `${job.source}-${i}`}
                    job={job}
                    jobIndex={i}
                  />
                ))}
              </div>

              {page < totalPages && (
                <div className="text-center mt-6">
                  <button
                    className="px-6 py-3 bg-[#24A8A2] text-white rounded-[14px] hover:bg-blue-600 transition font-outfit"
                    onClick={loadMore}
                    disabled={loading}
                  >
                    {loading ? "Loading..." : "Load More"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {showmodal && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setShowModal(false)}
        />
      )}

      <div
        className={`lg:hidden fixed left-1/2 bottom-6 transform -translate-x-1/2
        w-[95%] max-w-84 bg-white rounded-t-3xl shadow-2xl
        transition-all duration-300 ease-in-out z-50
        ${showmodal ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mt-3 mb-2" />
        <div className="p-4 overflow-y-auto max-h-[75vh]">
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
        </div>
      </div>
    </div>
  );
}

export default JobTable;
