"use client";

import React, { useMemo, useState } from "react";
import Applybutton from "./Applybutton";
import { isInternalJob, getJobType, getSeniorityLevel, type Job } from "./JobTable";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import { loginHref } from "../lib/hooks/nextPath";
import CompanyLogo from "./CompanyLogo";
import DescriptionBlocks from "./DescriptionBlocks";
import TailorResumePanel from "./TailorResumePanel";
import ReferralsCard from "./ReferralsCard";
import InsidersCard from "./InsidersCard";
import FitCard from "./FitCard";
import { InlineNotice, Modal } from "./Dialog";
import type { IUser } from "../models/User";
import dayjs from "dayjs";

interface JobDescriptionProps {
  job: any;
}

const JobDescription: React.FC<JobDescriptionProps> = ({ job }) => {
  const { user } = useCurrentUser();
  const pathname = usePathname();
  const [showModal, setShowModal] = useState(false);
  const [didYouApply, setDidYouApply] = useState(false);
  const [applied, setApplied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");
  const [notice, setNotice] = useState<string>("");

  const internal = useMemo(() => isInternalJob(job), [job]);
  // `active === false` is set by the loader on postings that have closed; undefined = open.
  const closed = job?.active === false;
  const applyUrl: string = job?.finalUrl || job?.url || "";

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
    if (!user || closed) return; // נציג הודעת התחברות / סגירה מתחת
    setNotice("");
    if (internal) {
      setShowModal(true);
      return;
    }
    // External job: the resolved apply link, or the posting URL when it was never resolved.
    if (applyUrl) {
      // בטוח יותר לפתוח חלון חדש בלי גישה ל-window.opener
      const newWin = window.open("", "_blank");
      if (newWin) {
        newWin.opener = null;
        newWin.location.href = applyUrl;
      } else {
        // fallback
        window.open(applyUrl, "_blank", "noopener");
      }
      setDidYouApply(true);
    } else {
      setNotice("הקישור למשרה עדיין לא זמין — נסה/י שוב בעוד רגע.");
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
        // Recorded: the prompt closes and the posting leaves the feed (it is tracked under Applications now).
        setDidYouApply(false);
        setApplied(true);
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

        {closed && (
          <div className="mt-5 jm-alert bg-canvas text-ink-600 border-line" role="status" dir="rtl">
            <span className="font-semibold text-navy">המשרה נסגרה.</span> התיאור נשאר כאן לעיון; אפשר לחפש משרות דומות ב
            <Link href={companyName ? `/?company=${encodeURIComponent(companyName)}` : "/"} className="underline underline-offset-2 ms-1">
              {companyName || "הפיד"}
            </Link>
            .
          </div>
        )}

        {user && (
          <div className="mt-5 flex flex-wrap gap-2">
            {!closed && (
              <button
                onClick={handleApplyClick}
                className="jm-btn jm-btn-accent hidden lg:inline-flex"
                disabled={submitting}
              >
                Apply
              </button>
            )}
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
            <Link href={loginHref(pathname)} className="font-medium underline">
              Go to Login
            </Link>
          </div>
        )}

        {notice && (
          <div className="mt-5">
            <InlineNotice kind="info" onDismiss={() => setNotice("")}>
              {notice}
            </InlineNotice>
          </div>
        )}

        {applied && (
          <div className="mt-5 jm-alert jm-alert-info" dir="auto">
            ✓ נרשם שהגשת מועמדות למשרה. היא תעקוב איתך תחת Applications ולא תופיע יותר בפיד.
          </div>
        )}

        {/* אישור הגשה למשרה חיצונית */}
        {didYouApply && !applied && (
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
          <aside className="min-w-0 space-y-6 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto jm-scroll">
            {user && jobKey && !internal && <FitCard jobId={String(job._id ?? job.id)} />}
            {user && jobKey && companyName && <InsidersCard company={companyName} jobId={String(job._id ?? job.id)} jobModel={internal ? "Job" : "ExternalJobs"} matchScore={typeof (job as any).matchScore === "number" ? (job as any).matchScore : null} />}
            {user && jobKey && companyName && (
              <ReferralsCard company={companyName} jobId={String(job._id ?? job.id)} source={internal ? "internal" : "external"} jobUrl={job?.finalUrl || job?.url} />
            )}
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

      {/* Mobile apply bar: sticky (not fixed) so it scrolls away with the page
          and never covers the footer. After an external apply it turns into
          the "Did you apply?" prompt right where the user tapped. */}
      {user && !closed && (
        <div className="sticky bottom-0 z-40 lg:hidden mt-6 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-surface/95 backdrop-blur border-t border-line">
          {applied ? (
            <div className="text-sm font-semibold text-center" dir="auto">✓ נרשם שהגשת מועמדות</div>
          ) : didYouApply ? (
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-sm">Did you apply?</span>
              <div className="flex gap-2">
                <button className="jm-btn jm-btn-primary jm-btn-sm" disabled={submitting} onClick={submitExternalApplication}>
                  {submitting ? "Sending..." : "Yes"}
                </button>
                <button className="jm-btn jm-btn-secondary jm-btn-sm" onClick={() => setDidYouApply(false)}>
                  No
                </button>
              </div>
            </div>
          ) : (
            <button onClick={handleApplyClick} className="jm-btn jm-btn-accent w-full" disabled={submitting}>
              Apply
            </button>
          )}
        </div>
      )}

      {/* מודאל למשרות פנימיות */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        label="Apply"
        overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4"
      >
        <div className="jm-card p-5 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto jm-scroll">
          <Applybutton setShowModal={setShowModal} job={job} />
        </div>
      </Modal>
    </div>
  );
};

export default JobDescription;
