"use client";
import React from "react";
import { Job } from "./JobTable";

interface JobFiltersProps {
  jobs: Job[];
  company: string;
  setCompany: (value: string) => void;
  country: string;
  setCountry: (value: string) => void;
  city: string;
  setCity: (value: string) => void;
}

const JobFilters: React.FC<JobFiltersProps> = ({
  jobs,
  company,
  setCompany,
  country,
  setCountry,
  city,
  setCity,
}) => {
  const getUniqueValues = <K extends keyof Job>(arr: Job[], key: K): string[] => {
  const values = arr
    .map((job) => {
      if (key === "company") {
        // InternalJob -> יש אובייקט עם companyName
        return typeof job.company === "object"
          ? job.company.companyName
          : job.company;
      }
      // כל שאר השדות ניגשים ישירות
      const value = job[key];
      return typeof value === "string" ? value : "";
    })
    .filter((value) => value.trim() !== "");

  // מחזיר רק ערכים ייחודיים
  return Array.from(new Set(values));
};


  const uniqueCompanies = getUniqueValues(jobs, "company");
  const uniqueCountries = getUniqueValues(jobs, "country");
  const uniqueCities = getUniqueValues(jobs, "city");

  return (
    <div className="w-full flex justify-center mt-6">
      <div className="flex flex-col md:flex-row flex-wrap gap-4 items-center justify-center bg-white p-4 rounded max-w-5xl w-full">
        {/* Company Filter */}
        <select
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="p-2 border rounded w-64"
        >
          <option value="">All Companies</option>
          {uniqueCompanies.map((comp) => (
            <option key={`company-${comp}`} value={comp}>
              {comp}
            </option>
          ))}
        </select>

        {/* Country Filter */}
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="p-2 border rounded w-64"
        >
          <option value="">All Types</option>
          {uniqueCountries.map((type) => (
            <option key={`type-${type}`} value={type}>
              {type}
            </option>
          ))}
        </select>

        {/* City Filter */}
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="p-2 border rounded w-64"
        >
          <option value="">All Cities</option>
          {uniqueCities.map((c) => (
            <option key={`city-${c}`} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default JobFilters;
