"use client";
import React, { useEffect, useState } from "react";
import JobCard from "./JobCard";
import JobFilters from "./filter";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
interface JobType {
  _id: string;
  job: string;
  type: string;
  location: string;
  country: String;
  company: {
    _id: string;
    companyName: string;
  };
}
function JobTable() {
  const { user } = useCurrentUser();
  const [jobs, setJobs] = useState<JobType[]>([]);
  const [company, setCompany] = useState("");
  const [jobType, setJobType] = useState("");
  const [jobLocation, setJobLocation] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchJobs(url: string) {
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) throw new Error("Failed to fetch jobs");

        const data = await res.json();
        setJobs(data);
      } catch (err) {
        console.error("Error fetching jobs:", err);
      } finally {
        setLoading(false);
      }
    }
    !user
      ? fetchJobs("/api/jobsDashboard/Alljobs")
      : fetchJobs(
          `/api/jobsDashboard/Candidate/allAnAplliedJobs?userId=${user._id}`
        );
  }, []);

  const filteredJobs = jobs.filter(
    (job) =>
      (company === "" || job.company.companyName === company) &&
      (jobLocation === "" || job.location === jobLocation) &&
      (jobType === "" || job.type === jobType)
  );

  return (
    <div>
      <JobFilters
        jobs={jobs}
        company={company}
        setCompany={setCompany}
        jobType={jobType}
        setJobType={setJobType}
        jobLocation={jobLocation}
        setJobLocation={setJobLocation}
      />
      {loading ? (
        <p className="text-center mt-4">Loading jobs...</p>
      ) : filteredJobs.length === 0 ? (
        <p className="text-center mt-4">No jobs match your criteria.</p>
      ) : (
        filteredJobs.map((elem, ind) => (
          <JobCard key={ind} job={elem} jobIndex={ind} />
        ))
      )}
    </div>
  );
}

export default JobTable;
