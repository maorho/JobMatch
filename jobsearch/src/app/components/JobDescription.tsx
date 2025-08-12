"use client";

import React, { useMemo, useState } from "react";
import Applybutton from "./Applybutton";
import { isInternalJob } from "./JobTable";
import Link from "next/link";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";

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
    ? (job?.qualifications?.split(", ").filter(Boolean) as string[]) || []
    : (job?.skills as string[]) || [];

  const appliedBorderClass =
    didYouApply || !user
      ? "shadow-xl p-5 w-[90%] max-w-2xl m-auto bg-white rounded-t-lg mt-6"
      : "shadow-xl p-5 w-[90%] max-w-2xl m-auto bg-white rounded-lg mt-6";

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
            candidateId: (user as any)?.id ?? (user as any)?._id,
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
    <div className="container">
      <div className={appliedBorderClass}>
        <h2 className="text-2xl font-semibold mb-2">
          {job?.job || job?.title}
        </h2>

        <div>
          <h3 className="mb-1">
            <span className="font-semibold">Company:</span>{" "}
            {internal ? job?.company?.companyName : job?.company}
          </h3>

          {internal && job?.description && (
            <div className="mb-4">
              <h3 className="font-semibold">Description:</h3>
              <p className="ml-1">{job.description}</p>
            </div>
          )}

          {qualifications.length > 0 && (
            <div className="mb-4">
              <h3 className="font-semibold">Qualifications:</h3>
              <ol className="list-disc list-inside">
                {qualifications.map((q: string, i: number) => (
                  <li key={`${q}-${i}`}>{q}</li>
                ))}
              </ol>
            </div>
          )}

          <div className="flex gap-4 font-semibold mb-4">
            <h3>
              {internal ? job?.type || "Full-time" : job?.type || "hybrid"}
            </h3>
            <h3>
              {(job?.location || "").toString()}
              {job?.country ? `, ${job.country}` : ""}
            </h3>
          </div>

          {user && (
            <button
              onClick={handleApplyClick}
              className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition disabled:opacity-60"
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
          <Link href="/LoginPage" className="text-blue-500 underline">
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
