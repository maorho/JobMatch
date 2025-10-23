"use client";

import React, { useMemo, useState } from "react";
import Applybutton from "./Applybutton";
import { isInternalJob } from "./JobTable";
import Link from "next/link";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import Image from "next/image";

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

const LocationIcon = () => (
  <svg
    width="14"
    height="17"
    viewBox="0 0 14 17"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="mt-1"
  >
    <path
      opacity="0.7"
      d="M7.3998 8.25C7.85355 8.25 8.24213 8.08857 8.56553 7.76572C8.88893 7.44287 9.05035 7.0543 9.0498 6.6C9.04925 6.1457 8.88783 5.7574 8.56553 5.4351C8.24323 5.1128 7.85465 4.9511 7.3998 4.95C6.94495 4.9489 6.55665 5.1106 6.2349 5.4351C5.91315 5.7596 5.75145 6.1479 5.7498 6.6C5.74815 7.0521 5.90985 7.44067 6.2349 7.76572C6.55995 8.09077 6.94825 8.2522 7.3998 8.25ZM7.3998 16.5C5.18605 14.6162 3.53275 12.8667 2.4399 11.2513C1.34705 9.636 0.800355 8.14055 0.799805 6.765C0.799805 4.7025 1.46338 3.05937 2.79053 1.83562C4.11768 0.611875 5.6541 0 7.3998 0C9.1455 0 10.6822 0.611875 12.0099 1.83562C13.3376 3.05937 14.0009 4.7025 13.9998 6.765C13.9998 8.14 13.4534 9.63545 12.3605 11.2513C11.2677 12.8672 9.6141 14.6168 7.3998 16.5Z"
      fill="#232323"
    />
  </svg>
);
const CompanyIcon = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 17 17"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="mt-1"
  >
    <g opacity="0.7">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12.7738 1.30568C12.7739 1.18451 12.7466 1.06487 12.694 0.955706C12.6414 0.846537 12.5649 0.750647 12.47 0.675185C12.3752 0.599722 12.2646 0.546633 12.1464 0.519875C12.0282 0.493117 11.9055 0.493381 11.7875 0.520646L2.12546 2.75096C1.94826 2.79188 1.79013 2.89159 1.67682 3.03384C1.56351 3.1761 1.5017 3.35252 1.50146 3.53439V15.6948H1.09887C0.992101 15.6948 0.889702 15.7372 0.814203 15.8127C0.738704 15.8882 0.696289 15.9906 0.696289 16.0974C0.696289 16.2042 0.738704 16.3066 0.814203 16.3821C0.889702 16.4576 0.992101 16.5 1.09887 16.5H5.52729V14.0845C5.52729 13.871 5.61212 13.6662 5.76312 13.5152C5.91412 13.3642 6.11892 13.2793 6.33246 13.2793H7.9428C8.15634 13.2793 8.36114 13.3642 8.51214 13.5152C8.66313 13.6662 8.74796 13.871 8.74796 14.0845V16.5H12.7738V1.30568ZM4.31954 5.22765C4.21277 5.22765 4.11037 5.27007 4.03487 5.34557C3.95937 5.42107 3.91696 5.52347 3.91696 5.63024V6.43541C3.91696 6.54218 3.95937 6.64458 4.03487 6.72008C4.11037 6.79558 4.21277 6.83799 4.31954 6.83799H5.12471C5.23148 6.83799 5.33388 6.79558 5.40938 6.72008C5.48488 6.64458 5.52729 6.54218 5.52729 6.43541V5.63024C5.52729 5.52347 5.48488 5.42107 5.40938 5.34557C5.33388 5.27007 5.23148 5.22765 5.12471 5.22765H4.31954ZM3.91696 8.04574C3.91696 7.93897 3.95937 7.83657 4.03487 7.76107C4.11037 7.68557 4.21277 7.64316 4.31954 7.64316H5.12471C5.23148 7.64316 5.33388 7.68557 5.40938 7.76107C5.48488 7.83657 5.52729 7.93897 5.52729 8.04574V8.85091C5.52729 8.95768 5.48488 9.06008 5.40938 9.13558C5.33388 9.21108 5.23148 9.25349 5.12471 9.25349H4.31954C4.21277 9.25349 4.11037 9.21108 4.03487 9.13558C3.95937 9.06008 3.91696 8.95768 3.91696 8.85091V8.04574ZM4.31954 10.0587C4.21277 10.0587 4.11037 10.1011 4.03487 10.1766C3.95937 10.2521 3.91696 10.3545 3.91696 10.4612V11.2664C3.91696 11.3732 3.95937 11.4756 4.03487 11.5511C4.11037 11.6266 4.21277 11.669 4.31954 11.669H5.12471C5.23148 11.669 5.33388 11.6266 5.40938 11.5511C5.48488 11.4756 5.52729 11.3732 5.52729 11.2664V10.4612C5.52729 10.3545 5.48488 10.2521 5.40938 10.1766C5.33388 10.1011 5.23148 10.0587 5.12471 10.0587H4.31954ZM6.33246 5.63024C6.33246 5.52347 6.37488 5.42107 6.45038 5.34557C6.52587 5.27007 6.62827 5.22765 6.73505 5.22765H7.54021C7.64699 5.22765 7.74938 5.27007 7.82488 5.34557C7.90038 5.42107 7.9428 5.52347 7.9428 5.63024V6.43541C7.9428 6.54218 7.90038 6.64458 7.82488 6.72008C7.74938 6.79558 7.64699 6.83799 7.54021 6.83799H6.73505C6.62827 6.83799 6.52587 6.79558 6.45038 6.72008C6.37488 6.64458 6.33246 6.54218 6.33246 6.43541V5.63024ZM6.73505 7.64316C6.62827 7.64316 6.52587 7.68557 6.45038 7.76107C6.37488 7.83657 6.33246 7.93897 6.33246 8.04574V8.85091C6.33246 8.95768 6.37488 9.06008 6.45038 9.13558C6.52587 9.21108 6.62827 9.25349 6.73505 9.25349H7.54021C7.64699 9.25349 7.74938 9.21108 7.82488 9.13558C7.90038 9.06008 7.9428 8.95768 7.9428 8.85091V8.04574C7.9428 7.93897 7.90038 7.83657 7.82488 7.76107C7.74938 7.68557 7.64699 7.64316 7.54021 7.64316H6.73505ZM6.33246 10.4612C6.33246 10.3545 6.37488 10.2521 6.45038 10.1766C6.52587 10.1011 6.62827 10.0587 6.73505 10.0587H7.54021C7.64699 10.0587 7.74938 10.1011 7.82488 10.1766C7.90038 10.2521 7.9428 10.3545 7.9428 10.4612V11.2664C7.9428 11.3732 7.90038 11.4756 7.82488 11.5511C7.74938 11.6266 7.64699 11.669 7.54021 11.669H6.73505C6.62827 11.669 6.52587 11.6266 6.45038 11.5511C6.37488 11.4756 6.33246 11.3732 6.33246 11.2664V10.4612ZM9.15055 5.22765C9.04378 5.22765 8.94138 5.27007 8.86588 5.34557C8.79038 5.42107 8.74796 5.52347 8.74796 5.63024V6.43541C8.74796 6.54218 8.79038 6.64458 8.86588 6.72008C8.94138 6.79558 9.04378 6.83799 9.15055 6.83799H9.95572C10.0625 6.83799 10.1649 6.79558 10.2404 6.72008C10.3159 6.64458 10.3583 6.54218 10.3583 6.43541V5.63024C10.3583 5.52347 10.3159 5.42107 10.2404 5.34557C10.1649 5.27007 10.0625 5.22765 9.95572 5.22765H9.15055ZM8.74796 8.04574C8.74796 7.93897 8.79038 7.83657 8.86588 7.76107C8.94138 7.68557 9.04378 7.64316 9.15055 7.64316H9.95572C10.0625 7.64316 10.1649 7.68557 10.2404 7.76107C10.3159 7.83657 10.3583 7.93897 10.3583 8.04574V8.85091C10.3583 8.95768 10.3159 9.06008 10.2404 9.13558C10.1649 9.21108 10.0625 9.25349 9.95572 9.25349H9.15055C9.04378 9.25349 8.94138 9.21108 8.86588 9.13558C8.79038 9.06008 8.74796 8.95768 8.74796 8.85091V8.04574ZM9.15055 10.0587C9.04378 10.0587 8.94138 10.1011 8.86588 10.1766C8.79038 10.2521 8.74796 10.3545 8.74796 10.4612V11.2664C8.74796 11.3732 8.79038 11.4756 8.86588 11.5511C8.94138 11.6266 9.04378 11.669 9.15055 11.669H9.95572C10.0625 11.669 10.1649 11.6266 10.2404 11.5511C10.3159 11.4756 10.3583 11.3732 10.3583 11.2664V10.4612C10.3583 10.3545 10.3159 10.2521 10.2404 10.1766C10.1649 10.1011 10.0625 10.0587 9.95572 10.0587H9.15055Z"
        fill="black"
      />
      <path
        d="M13.579 3.36852V16.5H16.3971C16.5038 16.5 16.6062 16.4576 16.6817 16.3821C16.7572 16.3066 16.7996 16.2042 16.7996 16.0974C16.7996 15.9906 16.7572 15.8882 16.6817 15.8127C16.6062 15.7372 16.5038 15.6948 16.3971 15.6948H15.9945V5.07387C15.9944 4.92438 15.9527 4.77786 15.8741 4.65073C15.7954 4.5236 15.6829 4.42087 15.5492 4.35405L13.579 3.36852ZM7.9428 16.5H6.33246V14.0845H7.9428V16.5Z"
        fill="black"
      />
    </g>
  </svg>
);

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
    <div className="w-full mt-4 lg:mt-10 lg:px-10">
      <DescriptionImg />
      <div className="mt-5 lg:mt-14 m-auto px-5">
        <div className="flex flex-col lg:flex-row mb-10">
          <div className="w-full mb-5 lg:w-1/2">
            <label className="text-[28px] lg:text-5xl font-outfit font-bold">
              {job?.job || job?.title}
            </label>
          </div>
          <div className="flex w-full items-start  lg:w-1/2 lg:justify-end gap-[60px]">
            <div className="flex items-center">
              <CompanyIcon />
              <div className="ml-2">
                <label className="text-left">
                  <span className="font-semibold">Company</span>
                  <br />
                  <span className="font-normal text-[#222222]/50">
                    {internal ? job?.company?.companyName : job?.company}
                  </span>
                </label>
              </div>
            </div>

            <div className="flex items-center">
              <LocationIcon />
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
            <div className="mb-5 rounded-4xl border-[1px] border-[#232323]/10 py-8 px-5">
              <h3 className="font-outfit text-3xl font-bold mb-10">
                Description:
              </h3>
              <p className="ml-1 text-2xl font-outfit font-normal text-[#232323]/50">
                {job.description}
              </p>
            </div>
          )}

          {qualifications.length > 0 && (
            <div className="mb-5 rounded-4xl border-[1px] border-[#232323]/10 py-8 px-5">
              <h3 className="font-outfit text-3xl font-bold mb-10">
                Qualifications:
              </h3>
              <ol className="list-decimal list-inside">
                {qualifications.map((q: string, i: number) => (
                  <li
                    key={`${q}-${i}`}
                    className="text-2xl font-outfit font-normal text-[#232323]/50"
                  >
                    {q}
                  </li>
                ))}
              </ol>
            </div>
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
