"use client";

import React, { useMemo, useState } from "react";
import Applybutton from "./Applybutton";
import { isInternalJob, getJobType, getSeniorityLevel, type Job } from "./JobTable";
import Link from "next/link";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import Image from "next/image";
import { CompanyIcon, LocationIconJobDescription } from "./icons";
import CompanyLogo from "./CompanyLogo";
import DescriptionBlocks from "./DescriptionBlocks";
import TailorResumePanel from "./TailorResumePanel";
import { IUser } from "../models/User";
import dayjs from "dayjs";

interface JobDescriptionProps {
  job: any;
}
const DescriptionImg = () => (
  <div className="relative w-full h-[300px] md:h-[400px] lg:h-[526px] overflow-hidden rounded-[20px] lg:rounded-[60px]">
    <Image
      src="/job_description.jpg"
      alt="job description background"
      fill
      className="object-cover"
      priority
    />
  </div>
);

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

  return (
    <div className="w-full mt-4 lg:mt-10 lg:px-10">
      <DescriptionImg />
      <div className="mt-5 lg:mt-14 m-auto px-5">
        {internal ? (
          <div className="flex flex-col lg:flex-row mb-10">
            <div className="w-full mb-5 lg:w-1/2">
              <label className="text-[28px] lg:text-5xl font-outfit font-bold">
                {job?.job || job?.title}
              </label>
            </div>
            <div className="flex w-full items-start lg:w-1/2 lg:justify-end gap-[60px]">
              <div className="flex">
                <CompanyIcon />
                <div className="ml-2">
                  <label className="text-left">
                    <span className="font-semibold">Company</span>
                    <br />
                    <span className="font-normal text-[#222222]/50">
                      {job?.company?.companyName}
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex">
                <LocationIconJobDescription />
                <div className="ml-2">
                  <span className="font-semibold">Location</span>
                  <div className="flex gap-4 font-normal text-[#222222]/50 items-center">
                    <label>
                      {(job?.location || "").toString()}
                      {job?.country ? `, ${job.country}` : ""}
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-10">
            <div className="flex items-start gap-4">
              <CompanyLogo
                name={companyName}
                domain={job?.companyDomain}
                logoUrl={job?.logoUrl}
                className="w-14 h-14 lg:w-16 lg:h-16 flex-shrink-0 border border-[#232323]/10 p-1"
              />
              <div className="min-w-0">
                <h1 className="text-[26px] lg:text-5xl font-outfit font-bold leading-tight">
                  {job?.job || job?.title}
                </h1>
                <p className="mt-1 text-lg lg:text-xl font-outfit text-[#232323]/70">
                  {companyName}
                </p>
              </div>
              {typeof job?.matchScore === "number" && (
                <span className="ml-auto flex-shrink-0 inline-flex items-center rounded-full bg-[#24A8A2]/10 text-[#24A8A2] text-sm font-semibold px-3 py-1">
                  {job.matchScore}% התאמה
                </span>
              )}
            </div>

            {metaChips.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-3">
                {metaChips.map((chip) => (
                  <div
                    key={chip.label}
                    className="rounded-2xl border border-[#232323]/10 px-4 py-2"
                  >
                    <div className="text-xs font-outfit uppercase tracking-wide text-[#232323]/40">
                      {chip.label}
                    </div>
                    <div className="text-sm lg:text-base font-outfit font-medium text-[#232323] capitalize">
                      {chip.value}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div>
          {!internal && job?.company_description && (
            <div className="mb-5 rounded-4xl border-[1px] border-[#232323]/10 py-8 px-5">
              <h3 className="font-outfit text-3xl font-bold mb-10">
                About Us:
              </h3>
              <p className="ml-1 text-2xl text-[#232323]/50">
                {job.company_description}
              </p>
            </div>
          )}
          {job?.description && (
            <div className="mb-5 rounded-4xl border-[1px] border-[#232323]/10 py-8 px-5 lg:px-8">
              <h3 className="font-outfit text-2xl lg:text-3xl font-bold mb-5">
                Description
              </h3>
              {internal ? (
                <p className="font-outfit font-normal text-base lg:text-lg leading-relaxed text-[#232323]/70 whitespace-pre-line break-words">
                  {job.description}
                </p>
              ) : (
                <DescriptionBlocks text={job.description} />
              )}
            </div>
          )}

          {qualifications.length > 0 && (
            <div className="mb-5 rounded-4xl border-[1px] border-[#232323]/10 py-8 px-5 lg:px-8">
              <h3 className="font-outfit text-2xl lg:text-3xl font-bold mb-5">
                {internal ? "Qualifications" : "Skills"}
              </h3>
              {internal ? (
                <ol className="list-decimal list-inside space-y-2">
                  {qualifications.map((q: string, i: number) => (
                    <li
                      key={`${q}-${i}`}
                      className="text-base lg:text-lg font-outfit font-normal text-[#232323]/70"
                    >
                      {q}
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {qualifications.map((q: string, i: number) => (
                    <span
                      key={`${q}-${i}`}
                      className="rounded-full bg-[#F9F9F9] border border-[#232323]/10 px-4 py-1.5 text-sm lg:text-base font-outfit text-[#232323]/80"
                    >
                      {q}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {user && (job?._id || job?.id) && (
            <TailorResumePanel
              jobId={String(job._id ?? job.id)}
              source={internal ? "internal" : "external"}
            />
          )}
          {user && (
            <button
              onClick={handleApplyClick}
              className="mt-10 bg-[#24A8A2] text-white px-10 py-5.5 rounded-[14px] hover:bg-blue-600 transition disabled:opacity-60"
              disabled={submitting}
            >
              Apply
            </button>
          )}
        </div>
      </div>

      {/* הודעת התחברות */}
      {!user && (
        <div className="text-center bg-white shadow-xl p-5 w-[90%] max-w-2xl m-auto rounded-b-lg">
          <h2 className="text-red-600 font-semibold">You are not logged in</h2>
          <Link href="/Login" className="text-blue-500 underline">
            Go to Login
          </Link>
        </div>
      )}

      {/* מודאל למשרות פנימיות */}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-[500px] max-w-full">
            <Applybutton setShowModal={setShowModal} job={job} />
          </div>
        </div>
      )}

      {/* אישור הגשה למשרה חיצונית */}
      {didYouApply && (
        <div className="bg-blue-100 shadow-xl p-5 w-[90%] max-w-2xl m-auto rounded-b-lg">
          <h2 className="font-semibold mb-3">Did you apply?</h2>
          <div className="flex items-center gap-6">
            <button
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition disabled:opacity-60"
              disabled={submitting}
              onClick={submitExternalApplication}
            >
              {submitting ? "Sending..." : "Yes"}
            </button>
            <button
              className="px-4 py-2 rounded border hover:bg-gray-50"
              onClick={() => setDidYouApply(false)}
            >
              No
            </button>
          </div>
          {error && <p className="text-red-600 mt-2">{error}</p>}
        </div>
      )}
    </div>
  );
};

export default JobDescription;
