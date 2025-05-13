"use client";

import React, { useState } from "react";
import Applybutton from "./Applybutton";

interface JobDescriptionProps {
  job: any;
}

const JobDescription: React.FC<JobDescriptionProps> = ({ job }) => {
  const [modal, setShowModal] = useState(false);
  const qualifications_arr = job.qualifications?.split(", ") || [];

  return (
    <div className="shadow-xl p-5 w-[90%] max-w-2xl m-auto bg-white rounded-lg mt-6">
      <h2 className="text-2xl font-semibold mb-2">{job.job}</h2>
      <div>
        <h3 className="mb-1">
          <span className="font-semibold">Company:</span>{" "}
          {job.company?.companyName}
        </h3>

        <div className="mb-4">
          <h3 className="font-semibold">Description:</h3>
          <p className="ml-1">{job.description}</p>
        </div>

        {qualifications_arr.length > 0 && (
          <div className="mb-4">
            <h3 className="font-semibold">Qualifications:</h3>
            <ol className="list-disc list-inside">
              {qualifications_arr.map((elem: string, index: number) => (
                <li key={index}>{elem}</li>
              ))}
            </ol>
          </div>
        )}

        <div className="flex gap-4 font-semibold mb-4">
          <h3>{job.type}</h3>
          <h3>
            {job.location}, {job.country}
          </h3>
        </div>

        <button
          onClick={() => setShowModal(true)}
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
