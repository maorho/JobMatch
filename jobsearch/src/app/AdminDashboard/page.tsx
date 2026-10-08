"use client";

import Link from "next/link";
import React, { useEffect, useState, useCallback } from "react";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import {Job} from "../components/JobTable";
import { IUser } from "../models/User";
import { motion } from "framer-motion";
import JobrecruiterCard from "../RecruiterDashboard/components/JobrecruiterCard";
import { AdminHero } from "../components/HeroImages";
import { EmptyState, Spinner } from "../components/ui";

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
const Jobs = ({ jobs }: { jobs: Job[] }) =>
  jobs.length === 0 ? (
    <EmptyState icon="🗂️" title="No jobs yet" />
  ) : (
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
      {jobs.map((job, i) => (
        <JobrecruiterCard key={job.id || i} job={job} jobIndex={i} />
      ))}
    </div>
  );


interface RecruitersProps {
  recruiters: IUser[];
  refreshRecruiters: () => void;
}
const Recruiters: React.FC<RecruitersProps> = ({ recruiters, refreshRecruiters }) => {
  const handleApprove = async (recruiterId: string) => {
    try {
      await approveRecruiter(recruiterId);
    } catch (e) {
      console.error("Approve failed:", e);
    }
    refreshRecruiters()
  }
  const handleDecline = async (recruiterId: string) => {
    try {
      await declineRecruiter(recruiterId);
    } catch (e) {
      console.error("Decline failed:", e);
    }
    refreshRecruiters()
  }
  if (recruiters.length === 0) {
    return <EmptyState icon="👥" title="No recruiters yet" />;
  }
  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
        {recruiters.map((recruiter, i) => (
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, duration: 0.5 }}
              key={recruiter._id ? String(recruiter._id) : i}
              className="jm-card p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base sm:text-lg font-semibold text-navy truncate">{recruiter.fullname}</h3>
                <span className={`jm-chip shrink-0 ${recruiter.approved ? "jm-chip-teal" : ""}`}>
                  Approved: {recruiter.approved ? "Yes" : "No"}
                </span>
              </div>
              <div className="text-sm text-ink-600 space-y-1">
                <p className="truncate">Email:{recruiter.email}</p>
                <p className="truncate">Company: {recruiter.company}</p>
              </div>
              <div className="flex flex-wrap gap-2 pt-3 mt-auto border-t border-line">
                <button className="jm-btn jm-btn-primary jm-btn-sm" onClick={() => handleApprove(recruiter._id.toString())}>Approve</button>
                <button className="jm-btn jm-btn-danger jm-btn-sm" onClick={() => handleDecline(recruiter._id.toString())}>Reject</button>
              </div>
            </motion.div>
        ))}
  </div>
  )

}
function EmployerDashboard() {
  const { user } = useCurrentUser();
  const [recruitersList, setRecruitersList] = useState<IUser[]>([]);
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
    return <Spinner label="Loading dashboard..." />;
  }


  if (!user) {
    return (
      <div className="jm-page">
        <EmptyState
          icon="🔒"
          title="You are not logged in."
          action={
            <Link href="/Login" className="jm-btn jm-btn-primary">
              Go to Login
            </Link>
          }
        />
      </div>
    );
  }


  if (!user.admin) {
    return (
      <div className="jm-page">
        <EmptyState
          icon="🔒"
          title="You are not an admin."
          action={
            <Link href="/Login" className="jm-btn jm-btn-primary">
              Go to Login
            </Link>
          }
        />
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

  const pendingRecruiters = recruitersList.filter((r) => !r.approved).length;
  const stats = [
    { label: "Jobs", value: jobs.length },
    { label: "Recruiters", value: recruitersList.length },
    { label: "Approved recruiters", value: recruitersList.length - pendingRecruiters },
    { label: "Pending approval", value: pendingRecruiters },
  ];

  return (
    <div className="jm-page space-y-6">
      <section
        id="recruiter hero section"
        className="jm-hero min-h-[220px] sm:min-h-[260px] flex"
      >
        <AdminHero />
        <div className="relative z-10 flex flex-col justify-center gap-3 p-6 sm:p-10 max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-wider text-white/70">Admin</div>
          <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight leading-tight">
            Welcome, {user.fullname}! 👋
          </h1>
          <p className="text-sm sm:text-base text-white/80">
            Review your company&apos;s positions and approve recruiters.
          </p>
        </div>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="jm-card p-5">
            <div className="text-3xl sm:text-4xl font-semibold text-navy leading-none">{stat.value}</div>
            <div className="jm-muted mt-2">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="space-y-5">
        {/* Tabs Header */}
        <div className="flex border-b border-line" role="tablist">
          {tabs.map((tab, index) => (
            <button
              key={index}
              role="tab"
              aria-selected={activeTab === index}
              onClick={() => setActiveTab(index)}
              className={`flex-1 sm:flex-none sm:px-6 py-3 text-center text-sm sm:text-base font-medium transition-colors -mb-px border-b-2 ${
                activeTab === index
                  ? "border-teal text-teal"
                  : "border-transparent text-ink-400 hover:text-navy"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tabs Content */}
        <div>
          {tabs[activeTab].content}
        </div>
      </div>
    </div>
  );
}

export default EmployerDashboard;
