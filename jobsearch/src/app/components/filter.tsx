"use client";
import React from "react";

interface JobFiltersProps {
  jobs: any[];
  company: string;
  setCompany: (value: string) => void;
  jobType: string;
  setJobType: (value: string) => void;
  jobLocation: string;
  setJobLocation: (value: string) => void;
}

const JobFilters: React.FC<JobFiltersProps> = ({
  jobs,
  company,
  setCompany,
  jobType,
  setJobType,
  jobLocation,
  setJobLocation,
}) => {
  return (
    <div className="w-full flex justify-center mt-6">
      <div className="flex flex-col md:flex-row flex-wrap gap-4 items-center justify-center bg-white p-4 rounded  max-w-5xl w-full">
        {/* Company Filter */}
        <select
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="p-2 border rounded w-64"
        >
          <option value="">All Companies</option>
          {[...new Set(jobs.map((job) => job.company))].map((company) => (
            <option key={company} value={company}>
              {company}
            </option>
          ))}
        </select>

        {/* Type Filter */}
        <select
          value={jobType}
          onChange={(e) => setJobType(e.target.value)}
          className="p-2 border rounded w-64"
        >
          <option value="">All Types</option>
          {[...new Set(jobs.map((job) => job.type))].map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        {/* Location Filter */}
        <select
          value={jobLocation}
          onChange={(e) => setJobLocation(e.target.value)}
          className="p-2 border rounded w-64"
        >
          <option value="">All Locations</option>
          {[...new Set(jobs.map((job) => job.location))].map((location) => (
            <option key={location} value={location}>
              {location}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default JobFilters;
