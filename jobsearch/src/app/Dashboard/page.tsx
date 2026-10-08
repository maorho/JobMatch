"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { Search } from "lucide-react";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import OutsideJobAdding from "./components/OutsideJobAdding";
import EmailTrackingCard from "./components/EmailTrackingCard";
import AutoApplyCard from "../components/AutoApplyCard";
import JobManagement from "./components/JobManagement";
import { CandidateHeroImage } from "../components/HeroImages";
import { EmptyState, Spinner } from "../components/ui";
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
  // Derived from the user's own applications (a small per-user list), so an
  // in-memory filter is right here; it's a memo, not state synced by an effect.
  const filteredJobs = useMemo(() => {
    if (!jobsSubmitted) return [];
    const term = searchTerm.toLowerCase();
    return jobsSubmitted.filter((job: any) => {
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
  }, [searchTerm, statusFilter, typeFilter, jobsSubmitted]);

  if (loading || isLoading) return <Spinner label="Loading..." />;


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

  if (user.recruiter) {
    return (
      <div className="jm-page">
        <EmptyState
          icon="🧭"
          title="You are a recruiter"
          action={
            <Link href="/RecruiterDashboard" className="jm-btn jm-btn-primary">
              Go to RecruiterDashboard
            </Link>
          }
        />
      </div>
    );
  }

  // Stat tiles are a pure read of the loaded list — no extra state.
  const allJobs: any[] = jobsSubmitted ?? [];
  const statusOf = (job: any) => String(job?.status ?? "").toLowerCase();
  const stats = [
    { label: "Applications", value: allJobs.length },
    { label: "In interviews", value: allJobs.filter((j) => statusOf(j).includes("interview")).length },
    { label: "Offers", value: allJobs.filter((j) => statusOf(j).includes("offer") || statusOf(j) === "accepted").length },
    { label: "Rejected", value: allJobs.filter((j) => statusOf(j) === "rejected").length },
  ];

  return (
    <div className="jm-page space-y-6">
      <section
        id="candidate hero section"
        className="jm-hero min-h-[220px] sm:min-h-[260px] flex"
      >
        <CandidateHeroImage />
        <div className="relative z-10 flex flex-col justify-center gap-3 p-6 sm:p-10 max-w-2xl">
          <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight leading-tight">
            Welcome, {user.fullname}! 👋
          </h1>
          <p className="text-sm sm:text-base text-white/80">Manage your job applications, track your progress, and find your next opportunity. </p>
          <div>
            <button
              onClick={() => setShowModal(true)}
              className="jm-btn jm-btn-accent"
            >
              Add New Job +
            </button>
          </div>
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

      {error && (
        <p className="jm-alert jm-alert-err">Something went wrong</p>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {isMobile ? (
          <h2 className="jm-h2">
            {jobsSubmitted ? jobsSubmitted.length : 0} Active Job Post
          </h2>
        ) : (
          <h2 className="jm-h2">
            You Have Applied to {jobsSubmitted ? jobsSubmitted.length : 0} Jobs
          </h2>
        )}
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          <div className="relative flex-1 sm:min-w-[240px]">
            <Search className="absolute start-4 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search for a job..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="jm-input ps-11"
            />
          </div>
          <div className="grid grid-cols-2 sm:flex gap-3">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="jm-input jm-select sm:w-auto">
              <option value="">Filter by Status</option>
              {[...new Set<string>((jobsSubmitted ?? []).map((job: any) => job.status).filter(Boolean))].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="jm-input jm-select sm:w-auto">
              <option value="">Filter by Type</option>
              {[...new Set<string>((jobsSubmitted ?? []).map((job: any) => (isSelfAddedJob(job) ? job.jobType : job.jobId?.type)).filter(Boolean))].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </div>

      <EmailTrackingCard />
      <section id="auto-apply" className="jm-card p-5 sm:p-6" dir="rtl">
        <h2 className="jm-h2 mb-3">⚡ הגשה אוטומטית</h2>
        <AutoApplyCard showList />
      </section>
      {jobsSubmitted && <JobManagement jobs={filteredJobs}/>}

      {showModal && (
        <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="jm-card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <OutsideJobAdding />
            <button
              onClick={() => setShowModal(false)}
              className="jm-btn jm-btn-ghost w-full mt-3"
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
