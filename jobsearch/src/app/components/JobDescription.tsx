"use client";

import React, { useEffect, useState } from "react";
import Applybutton from "./Applybutton";
import { Job } from "./JobTable";

interface JobDescriptionProps {
  job: any;
}
const checkJobType = (job: Job) => {
  return job.company === "object";
};
const JobDescription: React.FC<JobDescriptionProps> = ({ job }) => {
  const [modal, setShowModal] = useState(false);
  const qualifications_arr = job.qualifications?.split(", ") || [];
  const [finalUrl, setFinalUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!checkJobType(job)) {
      fetch(
        `http://localhost:4000/api/open-job?url=${encodeURIComponent(job.url)}`
      )
        .then((res) => res.json())
        .then((data) => {
          if (data.finalUrl) setFinalUrl(data.finalUrl);
        })
        .catch((err) => console.error("Prefetch error:", err));
    }
  }, [job]);
  return (
    <div className="shadow-xl p-5 w-[90%] max-w-2xl m-auto bg-white rounded-lg mt-6">
      <h2 className="text-2xl font-semibold mb-2">{job.job}</h2>
      <div>
        <h3 className="mb-1">
          <span className="font-semibold">Company:</span>{" "}
          {checkJobType(job) ? job.company.companyName : job.company}
        </h3>

        {checkJobType(job) && (
          <div className="mb-4">
            <h3 className="font-semibold">Description:</h3>
            <p className="ml-1">{job.description}</p>
          </div>
        )}

        {checkJobType(job)
          ? qualifications_arr.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold">Qualifications:</h3>
                <ol className="list-disc list-inside">
                  {qualifications_arr.map((elem: string, index: number) => (
                    <li key={index}>{elem}</li>
                  ))}
                </ol>
              </div>
            )
          : job.skills.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold">Qualifications:</h3>
                <ol className="list-disc list-inside">
                  {job.skills.map((elem: string, index: number) => (
                    <li key={index}>{elem}</li>
                  ))}
                </ol>
              </div>
            )}

        <div className="flex gap-4 font-semibold mb-4">
          <h3>{checkJobType(job) ? job.type : "hybrid"}</h3>
          <h3>
            {job.location}, {job.country}
          </h3>
        </div>

        <button
          onClick={() => {
            if (checkJobType(job)) {
              setShowModal(true);
            } else {
              if (finalUrl) {
                window.open(finalUrl, "_blank");
              } else {
                alert("הקישור עדיין נטען... נסה שוב בעוד רגע");
              }
            }
          }}
          className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition"
        >
          Apply
        </button>
      </div>

      {modal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-[500px] max-w-full">
            <Applybutton setShowModal={setShowModal} job={job} />
            <button
              onClick={() => setShowModal(false)}
              className="mt-4 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobDescription;
