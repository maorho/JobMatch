"use client";
import useSWR from "swr";
import React, { useMemo, useState, useEffect } from "react";
import JobCard from "./JobCard";
import JobFilters from "./filter";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import fetchSheetAsJson, { normalizeExternalJobs } from "./OutsideJobs";
import { setExternalJobs } from "../lib/Externaljobs";

export interface OutsideJob {
  id: string;
  job: string;
  company: string;
  city: string;
  country: string;
  seniority: string[];
  url: string;
  skills: string[];
}

export interface JobType {
  _id: string;
  job: string;
  type: string;
  city: string;
  country: string;
  seniority: string;
  company: {
    _id: string;
    companyName: string;
  };
}

export type Job = JobType | OutsideJob;

export const isInternalJob = (job: Job): job is JobType => {
  return typeof job.company === "object" && job.company !== null;
};
const CACHE_KEY = "cachedJobs";
const CACHE_TIME_KEY = "cachedJobsTimestamp";
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 שעות

function isCacheValid(): boolean {
  const t = localStorage.getItem(CACHE_TIME_KEY);
  if (!t) return false;
  return Date.now() - parseInt(t) < CACHE_TTL;
}

function loadCachedJobs(): Job[] | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
  } catch {
    return null;
  }
}

function saveJobsToCache(jobs: Job[]) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(jobs));
  localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
}

function JobTable() {
  const { user } = useCurrentUser();
  const [company, setCompany] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);
  const [initialJobs, setInitialJobs] = useState<Job[] | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && isCacheValid()) {
      const cached = loadCachedJobs();
      if (cached) {
        setInitialJobs(cached);
      }
    }
  }, []);

  const url = user
    ? `/api/jobsDashboard/Candidate/allAnAplliedJobs?userId=${user._id}`
    : "/api/jobsDashboard/Alljobs";

  const fetcher = async (): Promise<Job[]> => {
    const res = await fetch(url);
    const data = await res.json();
    const externalRaw = await fetchSheetAsJson();
    const external = normalizeExternalJobs(externalRaw);
    const all = [...data, ...external];
    if (typeof window !== "undefined") {
      saveJobsToCache(all);
    }
    setExternalJobs(external);
    return all;
  };

  const {
    data: jobs = [],
    isLoading,
    error,
  } = useSWR<Job[]>(initialJobs ? null : url, fetcher, {
    fallbackData: initialJobs || undefined,
    refreshInterval: CACHE_TTL,
    revalidateOnFocus: false,
  });

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (isInternalJob(job)) {
        return (
          (company === "" || job.company.companyName === company) &&
          (city === "" || job.city === city) &&
          (country === "" || job.country === country)
        );
      } else {
        return (
          (company === "" || job.company === company) &&
          (city === "" || job.city === city) &&
          (country === "" || job.country === country)
        );
      }
    });
  }, [jobs, company, city, country]);

  const loadMore = () => {
    setVisibleCount((prev) => Math.min(prev + 50, filteredJobs.length));
  };

  return (
    <div>
      <JobFilters
        jobs={jobs}
        company={company}
        setCompany={setCompany}
        country={country}
        setCountry={setCountry}
        city={city}
        setCity={setCity}
      />
      {isLoading ? (
        <p className="text-center mt-4">Loading jobs...</p>
      ) : error ? (
        <p className="text-center mt-4 text-red-500">
          Error loading jobs: {error.message}
        </p>
      ) : filteredJobs.length === 0 ? (
        <p className="text-center mt-4">No jobs match your criteria.</p>
      ) : (
        <>
          {filteredJobs.slice(0, visibleCount).map((job, i) => (
            <JobCard key={i} job={job} jobIndex={i} />
          ))}
          {visibleCount < filteredJobs.length && (
            <div className="text-center mt-4">
              <button
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
                onClick={loadMore}
              >
                Load More
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default JobTable;
