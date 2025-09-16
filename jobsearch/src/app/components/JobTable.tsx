"use client";
import React, { useState, useEffect } from "react";
import JobCard from "./JobCard";
import JobFilters from "./filter";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";

interface BaseJob {
  job: string;
  city: string;
  country: string;
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

function JobTable() {
  const { user } = useCurrentUser();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [company, setCompany] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");

  // ✅ מביא את המשרות מהשרת
  const fetchJobs = async (pageNum: number) => {
    try {
      setLoading(true);

      // internal jobs
      const internalUrl = user
        ? `/api/jobsDashboard/Candidate/allAnAplliedJobs?userId=${user._id}&page=${pageNum}&limit=50`
        : `/api/jobsDashboard/Alljobs?page=${pageNum}&limit=50`;

      const resInternal = await fetch(internalUrl);
      const internalData = await resInternal.json();
      console.log(internalData);
      // external jobs
      const resExternal = await fetch(
        `/api/external-jobs/fetch-all-external-jobs?page=${pageNum}&limit=50`
      );
      const externalData = await resExternal.json();

      // הוספת source לזיהוי
      const internalJobs = (internalData.jobs || []).map((j: any) => ({
        ...j,
        source: "internal",
      }));
      const externalJobs = (externalData.jobs || []).map((j: any) => ({
        ...j,
        source: "external",
      }));

      // מאחדים
      const merged = [...internalJobs, ...externalJobs];

      setJobs((prev) => (pageNum === 1 ? merged : [...prev, ...merged]));
      setTotalPages(Math.max(internalData.pages || 1, externalData.pages || 1));
    } catch (err) {
      console.error("❌ Failed to fetch jobs:", err);
    } finally {
      setLoading(false);
    }
  };

  // טוען כשעמוד מתחלף
  useEffect(() => {
    fetchJobs(page);
  }, [page]);

  // מסנן לפי בחירות המשתמש
  const filteredJobs = jobs.filter((job) => {
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

  const loadMore = () => {
    if (page < totalPages) setPage((prev) => prev + 1);
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

      {loading && page === 1 ? (
        <p className="text-center mt-4">Loading jobs...</p>
      ) : filteredJobs.length === 0 ? (
        <p className="text-center mt-4">No jobs match your criteria.</p>
      ) : (
        <>
          {filteredJobs.map((job, i) => (
            <JobCard key={job.id || i} job={job} jobIndex={i} />
          ))}

          {page < totalPages && (
            <div className="text-center mt-4">
              <button
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
                onClick={loadMore}
                disabled={loading}
              >
                {loading ? "Loading..." : "Load More"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default JobTable;
