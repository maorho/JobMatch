"use client";
import { useState } from "react";

const OutsideJobAdding = () => {
  const [job, setJob] = useState("");
  const [company, setCompany] = useState("");
  const [job_type, setJobType] = useState("");
  const [link, setLink] = useState("");
  const [location, setLocation] = useState("");
  const handleSubmit = async () => {};

  return (
    <div className="ml-3 p-2 items-center">
      <form onSubmit={handleSubmit} className="ml-10">
        <div className="items-center">
          <input
            type="text"
            className="text-center m-1 mt-2 w-80 h-10 border border-gray-300 rounded"
            placeholder="Job"
            value={job}
            onChange={(e) => setJob(e.target.value)}
          />
        </div>
        <div className="items-center">
          <input
            type="text"
            className="text-center m-1 w-80 h-10 border border-gray-300 rounded"
            placeholder="Company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </div>
        <div className="items-center">
          <input
            type="email"
            className="text-center ml-1 mt-1 w-80 h-10 border border-gray-300 rounded"
            placeholder="Type"
            value={job_type}
            onChange={(e) => setJobType(e.target.value)}
          />
        </div>
        <div className="items-center">
          <input
            type="email"
            className="text-center ml-1 mt-1 w-80 h-10 border border-gray-300 rounded"
            placeholder="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        <div className="items-center">
          <input
            type="text"
            className="text-center ml-1 mt-1 w-80 h-10 border border-gray-300 rounded"
            placeholder="Link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="items-center mx-1 w-80 h-10 bg-blue-500 text-white p-1 rounded hover:bg-blue-600 mt-1"
        >
          Add To My Dashboard
        </button>
      </form>
    </div>
  );
};

export default OutsideJobAdding;
