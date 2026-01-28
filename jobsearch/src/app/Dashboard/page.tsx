"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import useSWR from "swr";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import OutsideJobAdding from "./components/OutsideJobAdding";
import JobManagement from "./components/JobManagement";
import { CandidateHeroImage } from "../components/HeroImages";
import { SearchIcon } from "../components/icons";
import { useIsMobile } from "../lib/hooks/useIsMobile";
import { isSelfAddedJob } from "../../../utils/isSelfAddedJob";

const fetcher = async ([url, body]: [string, any]) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // אופציונלי: לקרוא את השגיאה מהשרת
    let errMsg = "Failed to fetch";
    try {
      const e = await res.json();
      if (e?.message) errMsg = e.message;
    } catch {}
    throw new Error(errMsg);
  }

  const data = await res.json(); // ⬅️ לקרוא פעם אחת
  return data; // ⬅️ להחזיר את אותו אובייקט
};


const DashboardPage: React.FC = () => {
  const { user, loading } = useCurrentUser();
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredJobs, setFilteredJobs] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const isMobile = useIsMobile();

  
    
  const swrKey =
    user && !user.recruiter
      ? [
          "/api/jobsDashboard/Candidate/allCandidatePositions",
          { userId: user.id },
        ]
      : null;

  const {
    data: jobsSubmitted,
    error,
    isLoading,
  } = useSWR(swrKey, fetcher, {
    refreshInterval: 10000,
    revalidateOnFocus: true,
  });
  useEffect(() => {
  if (!jobsSubmitted) return;

  const term = searchTerm.toLowerCase();

  const results = jobsSubmitted.filter((job: any) => {
    const matchesSearch =
      job?.jobId?.job?.toLowerCase().includes(term) ||
      job?.jobId?.company?.companyName?.toLowerCase().includes(term) ||
      job?.jobId?.country?.toLowerCase().includes(term) ||
      job?.status?.toLowerCase().includes(term) ||
      job?.jobId?.type?.toLowerCase().includes(term);

    const matchesStatus =
      !statusFilter || job?.status?.toLowerCase() === statusFilter.toLowerCase();

    const matchesType =
      !typeFilter || job?.jobId?.type?.toLowerCase() === typeFilter.toLowerCase();

    return matchesSearch && matchesStatus && matchesType;
  });

    setFilteredJobs(results);
  }, [searchTerm, statusFilter, typeFilter, jobsSubmitted]);

  if (loading || isLoading) return <p>Loading...</p>;

  
  if (!user) {
    return (
      <div className="text-center min-h-screen">
        <p className="text-red-500 text-lg">You are not logged in.</p>
        <Link href="/Login" className="text-blue-600 underline">
          Go to Login
        </Link>
      </div>
    );
  }

  if (user.recruiter) {
    return (
      <div className="text-center min-h-screen">
        <p className="text-red-500 text-lg">You are a recruiter</p>
        <Link href="/RecruiterDashboard" className="text-blue-600 underline">
          Go to RecruiterDashboard
        </Link>
      </div>
    );
  }
  console.log(`jobsSubmitted:`, jobsSubmitted);
  return (
    <div className="mt-8">
      <div className="items-center justify-items-center max-w-[1440px] mx-auto">
          <div
            id="candidate hero section"
            className="relative w-full pb-25 lg:mb-32 flex flex-col"
          >
            <div className="absolute inset-0 flex flex-col px-16 text-white z-10">
              <label className="text-3xl lg:text-7xl font-semibold pt-[92px] text-white mb-4">
                Welcome, {user.fullname}! 👋
              </label>
              <p className="text-white lg:text-[20px] font-normal font-poppins">Manage your job applications, track your progress, and find your next opportunity. </p>
              <button
                onClick={() => setShowModal(true)}
                className="mt-5 w-40 h-10 bg-[#11AEFF] text-white rounded-4xl md:rounded-[8px] hover:bg-[#24A8A2]"
              >
                Add New Job +
              </button>
            </div>
            <CandidateHeroImage />
          </div>
      </div>
      {error && (
        <p className="text-red-500 text-sm mb-4">Something went wrong</p>
      )}
      <div className="mx-auto flex lg:flex-row flex-col lg:gap-50 items-center justify-center mb-5">
        <div>
          {isMobile?<label className="font-bold text-3xl">
            {jobsSubmitted ? jobsSubmitted.length : 0} Active Job Post
          </label> 
           :<label className="font-bold text-3xl">
            You Have Applied to {jobsSubmitted ? jobsSubmitted.length : 0} Jobs
          </label>}
        </div>
        <div className="flex lg:flex-row bg-white md:bg-transparent rounded-2xl md:rounded-none flex-col gap-4">
          <div className="relative flex items-center w-full lg:max-w-[256px] h-[46px] bg-white rounded-[8px] shadow-sm">
            <input
              type="text"
              placeholder="Search for a job..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-full pl-10 pr-4 text-[15px] text-gray-700 placeholder-gray-400 rounded-[8px] focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <div className="absolute -top-2 text-gray-400">
              <SearchIcon />
            </div>
          </div>
          <div className="flex gap-4">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border-[#222222]/10 border-[1px] rounded-[8px] px-2 h-[46px] bg-white">
            <option className="border-[#222222]/10 border-[1px] rounded-[8px] px-2 h-[46px] bg-white" value="">Filter by Status</option>
            {jobsSubmitted?.
              map((job: any) => <option key={job._id} value={job.status}>{job.status}</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="border-[#222222]/10 border-[1px] rounded-[8px] px-2 h-[46px] bg-white">
            <option className="border-[#222222]/10 border-[1px] rounded-[8px] px-2 h-[46px] bg-white" value="">Filter by Type</option>
            {jobsSubmitted?.
              map((job: any) => <option key={job._id} value={isSelfAddedJob(job)?job.jobType:job.jobId.type}>{isSelfAddedJob(job)?job.jobType:job.jobId.type}</option>)}
          </select>
          </div>
          
        </div>
      </div>
      {jobsSubmitted && <JobManagement jobs={filteredJobs}/>}

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-6 rounded-lg w-[500px] max-w-full">
            <OutsideJobAdding />
            <button
              onClick={() => setShowModal(false)}
              className="mt-4 bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
