"use client";
import HealthCard from "./components/HealthCard";

import Link from "next/link";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import {Job} from "../components/JobTable";
import type { IUser } from "../models/User";
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
    await res.json();
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
  await res.json();
}
const declineRecruiter = async (recruiterId: string) => {
  const res = await fetch("/api/admin/declinerecruiter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recruiterId }),
  });
  if (!res.ok) throw new Error("Failed to decline recruiter");
  await res.json();
}
const Jobs = ({ jobs }: { jobs: Job[] }) =>
  jobs.length === 0 ? (
    <EmptyState icon="🗂️" title="No jobs yet" />
  ) : (
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
      {jobs.map((job, i) => (
        <JobrecruiterCard key={job._id || job.id || i} job={job} jobIndex={i} />
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
const LOGIN_HREF = "/Login?next=%2FAdminDashboard";

function AdminDashboard() {
  const { user, loading: authLoading } = useCurrentUser();
  const router = useRouter();
  const [recruitersList, setRecruitersList] = useState<IUser[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dataLoading, setDataLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<number>(0);
  const isAdmin = !!user?.admin;
  const company: string = user?.company ?? "";

  const fetchAllRecruiters = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/allrecruiters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: company }),
      });

      if (!res.ok) throw new Error("Failed to fetch recruiters");
      const data = await res.json();
      setRecruitersList(data||[]);
    } catch (err) {
      console.error("❌ Error fetching recruiters:", err);
    }
  }, [company]);


  const fetchAllCompaniesJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobsDashboard/Company/allCompanyJobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: company }),
      });

      if (!res.ok) throw new Error("Failed to fetch jobs");
      const data = await res.json();
      setJobs(data||[]);
    } catch (err) {
      console.error("❌ Error fetching jobs:", err);
    }
  }, [company]);


  // Logged-out visitors go to the login page (and come back here afterwards).
  useEffect(() => {
    if (!authLoading && !user) router.replace(LOGIN_HREF);
  }, [authLoading, user, router]);

  // Data loads only for admins; the auth phase is a separate flag so a
  // logged-out visitor never sees an endless spinner.
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const loadData = async () => {
      await Promise.all([fetchAllRecruiters(), fetchAllCompaniesJobs()]);
      if (!cancelled) setDataLoading(false);
    };
    loadData();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, fetchAllRecruiters, fetchAllCompaniesJobs]);

  if (authLoading) {
    return <Spinner label="Loading dashboard..." />;
  }

  if (!user) {
    return (
      <div className="jm-page">
        <EmptyState
          icon="🔒"
          title="You are not logged in."
          text="Redirecting to sign in…"
          action={
            <Link href={LOGIN_HREF} className="jm-btn jm-btn-primary">
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
          title="This area is for admins only."
          text={`You are signed in as ${user.fullname || user.email}, which is not an admin account.`}
          action={
            <Link href={user.recruiter ? "/RecruiterDashboard" : "/Dashboard"} className="jm-btn jm-btn-primary">
              Go to your dashboard
            </Link>
          }
        />
      </div>
    );
  }

  if (dataLoading) {
    return <Spinner label="Loading dashboard..." />;
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
          <div className="flex flex-wrap gap-2">
            <Link href="/AdminDashboard/agents" className="jm-btn jm-btn-accent w-fit">
              🤖 Agent team
            </Link>
            <Link href="/AdminDashboard/articles" className="jm-btn jm-btn-secondary w-fit">
              ✍️ Articles
            </Link>
            <Link href="/AdminDashboard/partners" className="jm-btn jm-btn-secondary w-fit">
              🤝 Partners
            </Link>
          </div>
        </div>
      </section>

      <HealthCard />

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

export default AdminDashboard;
