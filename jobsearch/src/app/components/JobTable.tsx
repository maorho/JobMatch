"use client";
import React, { useState, useEffect } from "react";
import JobCard from "./JobCard";
import JobFilters from "./filter";

import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import Image from "next/image";

interface BaseJob {
  job: string;
  city: string;
  country: string;
  createdAt?: Date;
  description?: string;
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
const LocationIcon = () => (
  <svg
    width="15"
    height="18"
    viewBox="0 0 15 18"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="absolute top-4 lg:top-5 left-5"
  >
    <path
      opacity="0.7"
      d="M7.2 9C7.695 9 8.1189 8.8239 8.4717 8.4717C8.8245 8.1195 9.0006 7.6956 9 7.2C8.9994 6.7044 8.8233 6.2808 8.4717 5.9292C8.1201 5.5776 7.6962 5.4012 7.2 5.4C6.7038 5.3988 6.2802 5.5752 5.9292 5.9292C5.5782 6.2832 5.4018 6.7068 5.4 7.2C5.3982 7.6932 5.5746 8.1171 5.9292 8.4717C6.2838 8.8263 6.7074 9.0024 7.2 9ZM7.2 18C4.785 15.945 2.9814 14.0364 1.7892 12.2742C0.597 10.512 0.0006 8.8806 0 7.38C0 5.13 0.7239 3.3375 2.1717 2.0025C3.6195 0.6675 5.2956 0 7.2 0C9.1044 0 10.7808 0.6675 12.2292 2.0025C13.6776 3.3375 14.4012 5.13 14.4 7.38C14.4 8.88 13.8039 10.5114 12.6117 12.2742C11.4195 14.037 9.6156 15.9456 7.2 18Z"
      fill="#232323"
    />
  </svg>
);
const SearchIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="absolute top-5 lg:left-4 left-5"
  >
    <path
      opacity="0.7"
      fillRule="evenodd"
      clipRule="evenodd"
      d="M13.6435 12.2923C14.8313 10.761 15.3911 8.83464 15.209 6.9052C15.0269 4.97576 14.1166 3.18816 12.6633 1.90607C11.21 0.62398 9.32284 -0.0562918 7.38576 0.00364974C5.44867 0.0635913 3.60718 0.859243 2.23591 2.22874C0.863447 3.59918 0.0651938 5.44139 0.00381983 7.37995C-0.0575541 9.3185 0.622571 11.2075 1.9056 12.662C3.18862 14.1165 4.97798 15.0271 6.90905 15.2081C8.84011 15.3892 10.7675 14.8271 12.2985 13.6364L12.3395 13.6792L16.3802 17.7209C16.4687 17.8094 16.5737 17.8796 16.6894 17.9275C16.805 17.9753 16.9289 18 17.0541 18C17.1793 18 17.3032 17.9753 17.4188 17.9275C17.5345 17.8796 17.6395 17.8094 17.728 17.7209C17.8165 17.6324 17.8867 17.5273 17.9346 17.4117C17.9825 17.296 18.0072 17.1721 18.0072 17.0469C18.0072 16.9218 17.9825 16.7978 17.9346 16.6822C17.8867 16.5666 17.8165 16.4615 17.728 16.373L13.6864 12.3323L13.6435 12.2923ZM11.6661 3.57658C12.2039 4.1057 12.6316 4.73606 12.9246 5.43131C13.2175 6.12655 13.3699 6.87293 13.373 7.62737C13.3761 8.38182 13.2297 9.12941 12.9425 9.82702C12.6552 10.5246 12.2326 11.1585 11.6991 11.6919C11.1656 12.2254 10.5318 12.648 9.83419 12.9353C9.13658 13.2226 8.38899 13.3689 7.63454 13.3658C6.8801 13.3628 6.13373 13.2104 5.43848 12.9174C4.74323 12.6244 4.11287 12.1967 3.58375 11.6589C2.52636 10.5841 1.93648 9.13508 1.94262 7.62737C1.94876 6.11967 2.55042 4.67547 3.61653 3.60936C4.68265 2.54325 6.12684 1.94159 7.63454 1.93545C9.14225 1.92931 10.5913 2.51919 11.6661 3.57658Z"
      fill="#333333"
    />
  </svg>
);
const HeroImg = () => (
  <div className="relative w-full h-[550px] md:h-[700px] lg:h-screen overflow-hidden rounded-[20px] lg:rounded-[60px]">
    <Image
      src="/hero.jpg"
      alt="Hero background"
      fill
      className="object-cover"
      priority
    />
  </div>
);

function JobTable() {
  const { user } = useCurrentUser();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [company, setCompany] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [jobCount, setJobCount] = useState(0);

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
        `/api/external-jobs/fetch-all-external-jobs?page=${pageNum}&limit=48`
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
      console.log(merged.length);
      setJobCount((prev) => (pageNum === 1 ? merged.length : prev + 48));
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
    if (page < totalPages) {
      setPage((prev) => prev + 1);
    }
  };

  return (
    <div className="w-screen items-center mx-auto">
      <div id="HeroSection" className="relative w-full mt-10">
        <HeroImg />
        <div className="font-outfit inset-0 flex flex-col absolute text-white items-center justify-center text-center px-4">
          <label className="text-4xl lg:text-7xl">
            Find Your Dream Job <br /> in Tech
          </label>
          <p className="mt-[40px]">
            Connect with top companies and discover opportunities that match
            your skills and ambitions
          </p>

          <div className="backdrop-blur-md lg:backdrop-blur-0 border border-white lg:border-0 p-2 lg:p-0 rounded-2xl mt-[40px] flex flex-col lg:flex-row items-center justify-center gap-5">
            <div className="relative w-full">
              <input
                className="bg-white w-full py-[23px] pl-12 lg:pl-10 rounded-[14px] lg:w-[525px] h-[58px] text-[#232323]"
                type="text"
                placeholder="Search jobs, companies, or keywords..."
              />
              <SearchIcon />
            </div>
            <div className="flex flex-row gap-4 items-center">
              <div className="relative w-max">
                <select
                  value="Location"
                  onChange={(e) => setCity(e.target.value)}
                  className="lg:p-2 border rounded-[14px] px-10 py-3 lg:w-53.5 lg:h-14.5 bg-white"
                >
                  <option className="font-outfit" value="">
                    Location
                  </option>
                </select>
                <LocationIcon />
              </div>

              <button className="bg-[#11AEFF] px-12 py-3.5 lg:px-20 lg:py-4 rounded-[14px] whitespace-nowrap w-fit lg:text-[16px] text-[12px]">
                Search Jobs
              </button>
            </div>
          </div>
        </div>
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 text-center lg:left-40 lg:w-[230px] lg:transform-none lg:text-left w-fit">
          <p className="text-white text-[14px] lg:text-[18px]">
            Job Match has a collection of +1000 high-end Jobs
          </p>
        </div>
      </div>
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
          <div className="flex flex-col md:flex-row items-start justify-center mx-auto lg:max-w-4/5 px-4 gap-5">
            {/* צד שמאל */}
            <div className="border border-[#232323]/10 rounded-4xl w-full max-w-[295px] h-full mx-auto"></div>

            {/* צד ימין */}
            <div className="flex-1">
              {/* כותרת וסינון */}
              <div className="flex flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <label className="font-outfit text-2xl lg:text-[34px] font-semibold">
                    Available Positions
                  </label>
                  <p className="lg:text-[16px] text-[12px] mt-2 text-[#232323]">
                    Showing {jobCount} jobs • Updated 2 minutes ago
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

              {/* כרטיסי משרות */}
              <div className="mt-10 sm:items-center grid grid-cols-1 lg:grid-cols-3 gap-5">
                {filteredJobs.map((job, i) => (
                  <JobCard key={job.id || i} job={job} jobIndex={i} />
                ))}
              </div>

              {/* Load More */}
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
    </div>
  );
}

export default JobTable;
