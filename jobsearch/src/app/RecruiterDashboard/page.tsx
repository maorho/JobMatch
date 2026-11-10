"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import { useT } from "../lib/i18n/LanguageProvider";
import JobrecruiterCard from "./components/JobrecruiterCard";
import AddNewPositionRecruiter from "./components/AddNewPositionRecruiter";
import { RecruiterHeroImage } from "../components/HeroImages";
import { EmptyState, Spinner } from "../components/ui";
import { Modal } from "../components/Dialog";

const LOGIN_HREF = "/Login?next=%2FRecruiterDashboard";

const RecruiterDashboardPage: React.FC = () => {
  const { t, dir } = useT();
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
      setError(t("recruiter.loadError"));
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

  if (loading) return <Spinner label={t("recruiter.loading")} />;

  if (!user) {
    return (
      <div className="jm-page" dir={dir}>
        <EmptyState
          icon="🔒"
          title={t("common.youAreNotLoggedIn")}
          action={
            <Link href={LOGIN_HREF} className="jm-btn jm-btn-primary">
              {t("common.goToLogin")}
            </Link>
          }
        />
      </div>
    );
  }

  if (!user.recruiter && !user.admin) {
    return (
      <div className="jm-page" dir={dir}>
        <EmptyState
          icon="🧭"
          title={t("recruiter.notRecruiter")}
          action={
            <Link href="/Dashboard" className="jm-btn jm-btn-primary">
              {t("recruiter.goToDashboard")}
            </Link>
          }
        />
      </div>
    );
  }

  // Stat tiles are a pure read of the loaded positions — no extra state.
  const typeOf = (job: any) => String(job?.type ?? "").toLowerCase();
  const stats = [
    { label: t("recruiter.stat.active"), value: jobLength },
    { label: t("recruiter.stat.remote"), value: jobs.filter((j) => typeOf(j) === "remote").length },
    { label: t("recruiter.stat.hybrid"), value: jobs.filter((j) => typeOf(j) === "hybrid").length },
    { label: t("recruiter.stat.onSite"), value: jobs.filter((j) => typeOf(j) === "on site").length },
  ];

  return (
    <div className="jm-page space-y-6" dir={dir}>
      <section
        id="recruiter hero section"
        className="jm-hero min-h-[220px] sm:min-h-[260px] flex"
      >
        <RecruiterHeroImage />
        <div className="relative z-10 flex flex-col justify-center gap-3 p-6 sm:p-10 max-w-2xl">
          <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight leading-tight">
            {t("recruiter.welcome", { name: user.fullname })}
          </h1>
          <p className="text-sm sm:text-base text-white/80">
            {t("recruiter.heroSub")}
          </p>
          {user.approved && (
            <div>
              <button
                onClick={() => setShowModal(true)}
                className="jm-btn jm-btn-accent"
              >
                {t("recruiter.addJob")}
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
          <Spinner label={t("recruiter.loadingJobs")} />
        ) : jobs.length == 0 ? (
          <EmptyState icon="🗂️" title={t("recruiter.boardEmpty")} />
        ) : (
          user.approved?(
            <div className="space-y-5">
            <h2 className="jm-h2">
              {t("recruiter.activeCount", { n: jobLength })}
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
            <p className="jm-alert jm-alert-err">{t("recruiter.notApproved")}</p>
          )
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} label={t("recruiter.addModalLabel")}>
        <div className="jm-card w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" dir={dir}>
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
