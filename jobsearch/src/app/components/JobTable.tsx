"use client";
import React, { useState } from "react";
import { jobs } from "./jobs";
import JobCard from "./JobCard";
import JobFilters from "./filter";

function JobTable() {
  const [company, setCompany] = useState("");
  const [jobType, setJobType] = useState("");
  const [jobLocation, setJobLocation] = useState("");

  const filteredJobs = jobs.filter(
    (job) =>
      (company === "" || job.company === company) &&
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
      {filteredJobs.map((elem, ind) => {
        return <JobCard key={ind} job={elem} jobIndex={ind} />;
      })}
    </div>
  );
}

export default JobTable;
