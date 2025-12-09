"use client";

import Link from "next/link";
import React, { useEffect, useState, useCallback } from "react";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import {Job} from "../components/JobTable"; 
import { IUserModel } from "../models/User";
import { motion } from "framer-motion";
import JobrecruiterCard from "../RecruiterDashboard/components/JobrecruiterCard";
import { AdminHero } from "../components/HeroImages";

interface Tab {
  label: string;
  content: React.ReactNode;
}
const changeStatus = async (recruiterId: string, status: 'approve' | 'decline') => {
  try {
    const res = await fetch("/api/admin/changerecruiterstatus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recruiterId, status }),
    });

    if (!res.ok) throw new Error("Failed to change recruiter status");
    const data = await res.json();
    console.log(data.msg);
  } catch (err) {
    console.error("❌ Error changing recruiter status:", err);
  }
};

const approveRecruiter = async (recruiterId: string) => {
  const res = await fetch("/api/admin/approverecruiter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recruiterId }),
  });
  if (!res.ok) throw new Error("Failed to approve recruiter");
  const data = await res.json();
  console.log(data.msg);    
}
const declineRecruiter = async (recruiterId: string) => {
  const res = await fetch("/api/admin/declinerecruiter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recruiterId }),
  });
  if (!res.ok) throw new Error("Failed to decline recruiter");
  const data = await res.json();
  console.log(data.msg);    
} 
const Jobs = ({ jobs }: { jobs: Job[] }) => (
  <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {jobs.map((job, i) => (
            <JobrecruiterCard key={job.id || i} job={job} jobIndex={i} />
        ))}
  </div>
)


interface RecruitersProps {
  recruiters: IUserModel[];
  refreshRecruiters: () => void;
}
const Recruiters: React.FC<RecruitersProps> = ({ recruiters, refreshRecruiters }) => {
  const handleApprove = async (recruiterId: string) => {
    await approveRecruiter(recruiterId);
    refreshRecruiters()
  }
  const handleDecline = async (recruiterId: string) => {
    await declineRecruiter(recruiterId);
    refreshRecruiters()
  }
  return (
    <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {recruiters.map((recruiter, i) => (
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, duration: 0.5 }}
              key={recruiter._id ? String(recruiter._id) : i} 
              className="border border-[#000000]/10 p-4 rounded shadow">
              <h3 className="text-lg font-semibold">{recruiter.fullname}</h3>
              <p className="text-gray-600">Email:{recruiter.email}</p>
              <p className="text-gray-600">Company: {recruiter.company}</p>
              <p className="text-gray-600">Approved: {recruiter.approved ? "Yes" : "No"}</p>
              <button className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600" onClick={() => handleApprove(recruiter._id as string)}>Approve</button>
              <button className="mt-2 ml-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600" onClick={() => handleDecline(recruiter._id as string)}>Reject</button>
            </motion.div>
        ))}
  </div>
  ) 
  
}
function EmployerDashboard() {
  const { user } = useCurrentUser();
  const [recruitersList, setRecruitersList] = useState<IUserModel[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<number>(0);

  
  const fetchAllRecruiters = useCallback(async () => {
    if (!user) return;

    try {
      const res = await fetch("/api/admin/allrecruiters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: user.company }),
      });

      if (!res.ok) throw new Error("Failed to fetch recruiters");
      const data = await res.json();
      setRecruitersList(data||[]);
      console.log(recruitersList);
    } catch (err) {
      console.error("❌ Error fetching recruiters:", err);
    }
  }, [user]);

  
  const fetchAllCompaniesJobs = useCallback(async () => {
    if (!user) return;

    try {
      const res = await fetch("/api/jobsDashboard/Company/allCompanyJobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: user.company }),
      });

      if (!res.ok) throw new Error("Failed to fetch jobs");
      const data = await res.json();
      setJobs(data||[]);
      console.log(jobs);
    } catch (err) {
      console.error("❌ Error fetching jobs:", err);
    }
  }, [user]);


  useEffect(() => {
    if (!user) return;
    setLoading(true);
    console.log(user);
    const loadData = async () => {
      await Promise.all([fetchAllRecruiters(), fetchAllCompaniesJobs()]);
      setLoading(false);
    };

    loadData();
  }, [user, fetchAllRecruiters, fetchAllCompaniesJobs]);

  // ⏳ מצב טעינה
  if (!user || loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-gray-600 text-lg">Loading dashboard...</p>
      </div>
    );
  }

 
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


  if (!user.admin) {
    return (
      <div className="text-center min-h-screen">
        <p className="text-red-500 text-lg">You are not an admin.</p>
        <Link href="/LoginPage" className="text-blue-600 underline">
          Go to Login
        </Link>
      </div>
    );
  }

  const tabs: Tab[] = [
    {
      label: "Jobs",
      content: <Jobs jobs={jobs} />,
    },
    {
      label: "Recruiters",
      content: <Recruiters recruiters={recruitersList} refreshRecruiters={fetchAllRecruiters}/>,
    },
  ];
  
  return (
    <div className="p-6 items-center justify-items-center min-h-screen">
      <div
        id="recruiter hero section"
        className="relative w-full pb-25 lg:mb-32 flex flex-col"
      >
        <div className="absolute inset-0 flex flex-col text-white items-center justify-center text-center px-4 z-10">
          <label className="text-3xl lg:text-7xl font-semibold mb-4">
            Welcome, {user.fullname}! 👋
          </label>
        </div>

        <AdminHero />
      </div>

  
       <div className="w-full max-w-5xl mx-auto mt-10 font-outfit">
      {/* Tabs Header */}
      <div className="flex border-b border-gray-300">
        {tabs.map((tab, index) => (
          <button
            key={index}
            onClick={() => setActiveTab(index)}
            className={`flex-1 py-3 text-center text-sm lg:text-base font-medium transition-colors ${
              activeTab === index
                ? "border-b-2 border-[#24A8A2] text-[#24A8A2]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tabs Content */}
      <div className="p-4 bg-white shadow-md rounded-b-lg">
        {tabs[activeTab].content}
      </div>
    </div>
    </div>
  );
}

export default EmployerDashboard;