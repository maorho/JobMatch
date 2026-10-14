"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import JobrecruiterCard from "./components/JobrecruiterCard";
import AddNewPositionRecruiter from "./components/AddNewPositionRecruiter";
import { RecruiterHeroImage } from "../components/HeroImages";
import { EmptyState, Spinner } from "../components/ui";
import { Modal } from "../components/Dialog";

const LOGIN_HREF = "/Login?next=%2FRecruiterDashboard";

const RecruiterDashboardPage: React.FC = () => {
  const { user, loading } = useCurrentUser();
  const [jobs, setJobs] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [jobLength, setjobLength] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(true);
  async function loadJobs() {
    setError("");
    setLoadingJobs(true); // התחלת טעינה
    try {
      const res = await fetch("/api/jobsDashboard/Company/allCompanyJobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: user.company }),
      });

      if (!res.ok) throw new Error("Request failed");

      const data = await res.json();
      setJobs(data);
      setjobLength(data.length);
    } catch (err) {
      console.error(err);
      setError("Something went wrong while loading your positions.");
    } finally {
      setLoadingJobs(false); // סיום טעינה
    }
  }

  useEffect(() => {
    // Only recruiters have a company to load jobs for. Admins (and anyone else)
    // just get the spinner cleared — loading company jobs with an empty company
    // name would 404.
    if (user?.recruiter) {
      loadJobs();
    } else if (user) {
      setLoadingJobs(false);
    }
  }, [user]);

  if (loading) return <Spinner label="Loading..." />;

  if (!user) {
    return (
      <div className="jm-page">
        <EmptyState
          icon="🔒"
          title="You are not logged in."
          action={
            <Link href={LOGIN_HREF} className="jm-btn jm-btn-primary">
              Go to Login
            </Link>
          }
        />
      </div>
    );
  }

  if (!user.recruiter && !user.admin) {
    return (
      <div className="jm-page">
        <EmptyState
          icon="🧭"
          title="You are not a recruiter."
          action={
            <Link href="/Dashboard" className="jm-btn jm-btn-primary">
              Go to Dashboard
            </Link>
          }
        />
      </div>
    );
  }

  // Stat tiles are a pure read of the loaded positions — no extra state.
  const typeOf = (job: any) => String(job?.type ?? "").toLowerCase();
  const stats = [
    { label: "Active positions", value: jobLength },
    { label: "Remote", value: jobs.filter((j) => typeOf(j) === "remote").length },
    { label: "Hybrid", value: jobs.filter((j) => typeOf(j) === "hybrid").length },
    { label: "On site", value: jobs.filter((j) => typeOf(j) === "on site").length },
  ];

  return (
    <div className="jm-page space-y-6">
      <section
        id="recruiter hero section"
        className="jm-hero min-h-[220px] sm:min-h-[260px] flex"
      >
        <RecruiterHeroImage />
        <div className="relative z-10 flex flex-col justify-center gap-3 p-6 sm:p-10 max-w-2xl">
          <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight leading-tight">
            Welcome, {user.fullname}! 👋
          </h1>
          <p className="text-sm sm:text-base text-white/80">
            Manage your open positions and review the candidates who applied.
          </p>
          {user.approved && (
            <div>
              <button
                onClick={() => setShowModal(true)}
                className="jm-btn jm-btn-accent"
              >
                Add New Job +
              </button>
            </div>
          )}
        </div>
      </section>

      {!loadingJobs && user.approved && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="jm-card p-5">
              <div className="text-3xl sm:text-4xl font-semibold text-navy leading-none">{stat.value}</div>
              <div className="jm-muted mt-2">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="jm-alert jm-alert-err">{error}</p>}

      <div>
        {loadingJobs ? (
          <Spinner label="Loading your jobs..." />
        ) : jobs.length == 0 ? (
          <EmptyState icon="🗂️" title="Your Board is Empty" />
        ) : (
          user.approved?(
            <div className="space-y-5">
            <h2 className="jm-h2">
              You Have {jobLength} Active Job Posts
            </h2>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
              {jobs.map((element, ind) => {
                return (
                  <JobrecruiterCard
                    key={element._id ?? element.id ?? ind}
                    job={element}
                    jobIndex={ind}
                    onSuccess={loadJobs}
                  />
                );
              })}
            </div>
          </div>
          ):(
            <p className="jm-alert jm-alert-err">Your recruiter account is not approved yet. Please wait for admin approval.</p>
          )
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} label="Add new position">
        <div className="jm-card w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
          <AddNewPositionRecruiter
            onSuccess={() => {
              setShowModal(false);
              loadJobs();
            }}
            setShowModal={setShowModal}
          />
        </div>
      </Modal>
    </div>
  );
};

export default RecruiterDashboardPage;
