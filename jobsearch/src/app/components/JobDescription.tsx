"use client";

import React, { useMemo, useState } from "react";
import Applybutton from "./Applybutton";
import { isInternalJob, getJobType, getSeniorityLevel, type Job } from "./JobTable";
import Link from "next/link";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import CompanyLogo from "./CompanyLogo";
import DescriptionBlocks from "./DescriptionBlocks";
import TailorResumePanel from "./TailorResumePanel";
import { IUser } from "../models/User";
import dayjs from "dayjs";

interface JobDescriptionProps {
  job: any;
}

const JobDescription: React.FC<JobDescriptionProps> = ({ job }) => {
  const { user } = useCurrentUser();
  const [showModal, setShowModal] = useState(false);
  const [didYouApply, setDidYouApply] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");

  const internal = useMemo(() => isInternalJob(job), [job]);

  const qualifications = internal
    ? typeof job?.qualifications === "string"
      ? job.qualifications.split(", ").filter(Boolean)
      : Array.isArray(job?.qualifications)
      ? (job.qualifications as string[])
      : []
    : (job?.skills as string[]) || [];

  // External-job presentation data.
  const companyName = internal ? job?.company?.companyName : job?.company;
  const cityCountry = [job?.city, job?.country]
    .filter((v) => v && String(v).trim() && String(v) !== "Unknown")
    .join(", ");
  const workMode = !internal ? getJobType(job as Job) : job?.type;
  const cityCountryLabel = cityCountry || (job?.remote ? "Remote" : "");
  const seniorityLabel = !internal ? getSeniorityLevel(job as Job) : job?.seniority;
  const postedDate = job?.postedAt || job?.createdAt;
  const postedLabel = postedDate ? dayjs(postedDate).format("MMM D, YYYY") : "";
  const sourceLabel =
    !internal && job?.source && job.source !== "external"
      ? String(job.source)
      : "";
  const metaChips = !internal
    ? ([
        cityCountryLabel && { label: "Location", value: cityCountryLabel },
        workMode && { label: "Work mode", value: workMode },
        seniorityLabel && { label: "Seniority", value: seniorityLabel },
        postedLabel && { label: "Posted", value: postedLabel },
        sourceLabel && { label: "Source", value: sourceLabel },
      ].filter(Boolean) as { label: string; value: string }[])
    : [];

  // Internal postings only carry a free-text location.
  const internalLocation = internal
    ? `${(job?.location || "").toString()}${job?.country ? `, ${job.country}` : ""}`.trim()
    : "";

  const handleApplyClick = () => {
    if (!user) return; // נציג הודעת התחברות מתחת
    if (internal) {
      setShowModal(true);
      return;
    }
    // External job
    if (job?.finalUrl) {
      // בטוח יותר לפתוח חלון חדש בלי גישה ל-window.opener
      const newWin = window.open("", "_blank");
      if (newWin) {
        newWin.opener = null;
        newWin.location.href = job.finalUrl;
      } else {
        // fallback
        window.open(job.finalUrl, "_blank", "noopener");
      }
      setDidYouApply(true);
    } else {
      alert("הקישור עדיין נטען... נסה שוב בעוד רגע");
    }
  };

  const submitExternalApplication = async () => {
    if (!user) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(
        "/api/jobsDashboard/Candidate/externalJobApplication",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "Submitted Resume",
            jobId: job?._id ?? job?.id,
            candidateId: (user as IUser)?.id ?? (user as IUser)?._id,
          }),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message || "Application failed");
      } else {
        alert(data?.message || "Application sent!");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const jobKey = job?._id || job?.id;
  const canMessageRecruiter =
    !!user && internal && !!job?.publisher && String(job.publisher) !== String((user as any)._id ?? (user as any).id);
  const showAboutCompany = !internal && !!job?.company_description;

  return (
    <div className="jm-page">
      {/* Header card */}
      <section className="jm-card p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 shrink-0 rounded-2xl border border-line bg-surface p-1.5 overflow-hidden">
            <CompanyLogo
              name={companyName}
              domain={job?.companyDomain}
              logoUrl={job?.logoUrl}
              className="w-full h-full"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="jm-title break-words">{job?.job || job?.title}</h1>
            {companyName && <p className="mt-1 text-base sm:text-lg text-ink-600">{companyName}</p>}
          </div>
        </div>

        {(metaChips.length > 0 || internalLocation || typeof job?.matchScore === "number") && (
          <div className="mt-4 flex flex-wrap gap-2">
            {typeof job?.matchScore === "number" && (
              <span className="jm-chip jm-chip-teal">{job.matchScore}% התאמה</span>
            )}
            {internalLocation && (
              <span className="jm-chip" title="Location">
                {internalLocation}
              </span>
            )}
            {metaChips.map((chip) => (
              <span key={chip.label} className="jm-chip capitalize" title={chip.label}>
                <span className="text-ink-400 font-normal">{chip.label}:</span> {chip.value}
              </span>
            ))}
          </div>
        )}

        {user && (
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={handleApplyClick}
              className="jm-btn jm-btn-accent hidden lg:inline-flex"
              disabled={submitting}
            >
              Apply
            </button>
            {jobKey && (
              <Link
                href={`/interview-prep/${internal ? "internal" : "external"}/${String(job._id ?? job.id)}`}
                className="jm-btn jm-btn-secondary"
              >
                🎯 הכנה לראיון למשרה הזו
              </Link>
            )}
            {canMessageRecruiter && (
              <Link
                href={`/messages?to=${String(job.publisher)}&job=${String(job._id ?? job.id)}`}
                className="jm-btn jm-btn-ghost"
              >
                💬 שלח הודעה למגייס
              </Link>
            )}
          </div>
        )}

        {/* הודעת התחברות */}
        {!user && (
          <div className="mt-5 jm-alert jm-alert-err flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">You are not logged in</span>
            <Link href="/Login" className="font-medium underline">
              Go to Login
            </Link>
          </div>
        )}

        {/* אישור הגשה למשרה חיצונית */}
        {didYouApply && (
          <div className="mt-5 jm-alert jm-alert-info">
            <h2 className="font-semibold mb-3">Did you apply?</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="jm-btn jm-btn-primary jm-btn-sm"
                disabled={submitting}
                onClick={submitExternalApplication}
              >
                {submitting ? "Sending..." : "Yes"}
              </button>
              <button className="jm-btn jm-btn-secondary jm-btn-sm" onClick={() => setDidYouApply(false)}>
                No
              </button>
            </div>
            {error && <p className="text-red-700 mt-2">{error}</p>}
          </div>
        )}
      </section>

      {/* Body: description + sidebar */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px] items-start">
        <div className="min-w-0 space-y-6">
          {job?.description && (
            <section className="jm-card p-5 sm:p-6">
              {internal ? (
                <p className="text-ink-600 leading-relaxed whitespace-pre-line break-words">{job.description}</p>
              ) : (
                <DescriptionBlocks text={job.description} />
              )}
            </section>
          )}

          {qualifications.length > 0 && (
            <section className="jm-card p-5 sm:p-6">
              <h3 className="jm-h2 mb-4">{internal ? "Qualifications" : "Skills"}</h3>
              {internal ? (
                <ol className="list-decimal ps-5 space-y-1 text-ink-600 leading-relaxed marker:text-teal">
                  {qualifications.map((q: string, i: number) => (
                    <li key={`${q}-${i}`}>{q}</li>
                  ))}
                </ol>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {qualifications.map((q: string, i: number) => (
                    <span key={`${q}-${i}`} className="jm-chip">
                      {q}
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        {(showAboutCompany || (user && jobKey)) && (
          <aside className="min-w-0 space-y-6 lg:sticky lg:top-24">
            {user && jobKey && (
              <TailorResumePanel
                jobId={String(job._id ?? job.id)}
                source={internal ? "internal" : "external"}
              />
            )}
            {showAboutCompany && (
              <section className="jm-card p-5">
                <h3 className="jm-h2 mb-2">About Us:</h3>
                <p className="text-sm text-ink-600 leading-relaxed break-words" dir="auto">
                  {job.company_description}
                </p>
              </section>
            )}
          </aside>
        )}
      </div>

      {/* Spacer so the mobile apply bar never covers content. */}
      {user && <div className="h-20 lg:hidden" aria-hidden />}

      {/* Mobile sticky apply bar */}
      {user && (
        <div className="fixed bottom-0 inset-x-0 z-40 lg:hidden p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-surface/95 backdrop-blur border-t border-line">
          <div className="mx-auto w-full max-w-[1280px]">
            <button onClick={handleApplyClick} className="jm-btn jm-btn-accent w-full" disabled={submitting}>
              Apply
            </button>
          </div>
        </div>
      )}

      {/* מודאל למשרות פנימיות */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4">
          <div className="jm-card p-5 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto jm-scroll">
            <Applybutton setShowModal={setShowModal} job={job} />
          </div>
        </div>
      )}
    </div>
  );
};

export default JobDescription;
