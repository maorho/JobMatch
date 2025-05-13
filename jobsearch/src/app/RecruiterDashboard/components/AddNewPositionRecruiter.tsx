import { useCurrentUser } from "@/app/lib/hooks/useCurrentUser";
import React, { useState, useEffect } from "react";

interface AddNewPositionRecruiterProps {
  jobId?: string;
  onSuccess?: () => void;
}

const AddNewPositionRecruiter: React.FC<AddNewPositionRecruiterProps> = ({
  jobId,
  onSuccess,
}) => {
  const { user, loading } = useCurrentUser();
  const [job, setJob] = useState("");
  const [company, setCompany] = useState("");
  const [job_type, setJobType] = useState("");
  const [country, setCountry] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [qualifications, setQualifications] = useState("");
  const [publisher, setPublisher] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (user) {
      setCompany(user.company || "");
      setPublisher(user.id || "");
    }
  }, [user]);

  useEffect(() => {
    async function fetchJobData() {
      if (!jobId) return;
      try {
        const res = await fetch(
          `/api/jobsDashboard/Recruiter/getJobDetails?jobId=${jobId}`
        );
        const data = await res.json();
        if (res.ok) {
          setJob(data.job);
          setJobType(data.type);
          setCountry(data.country);
          setLocation(data.location);
          setDescription(data.description);
          setQualifications(data.qualifications);
        } else {
          setError(data.message || "Failed to load job data");
        }
      } catch {
        setError("Error fetching job details");
      }
    }
    fetchJobData();
  }, [jobId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (job === "") return setError("Job title is required");
    if (job_type === "") return setError("Job type is required");
    if (country === "") return setError("Country is required");
    if (location === "") return setError("City is required");
    if (description === "") return setError("Job description is required");
    if (qualifications === "")
      return setError("Job qualifications are required");

    try {
      const body = jobId
        ? {
            jobId,
            updatedFields: {
              job,
              type: job_type,
              country,
              location,
              description,
              qualifications,
            },
          }
        : {
            job,
            company,
            type: job_type,
            location,
            country,
            link: null,
            outsidesource: false,
            description,
            qualifications,
            publisher,
          };
      console.log(`jobId:${jobId}`);
      const res = await fetch(
        jobId
          ? "/api/jobsDashboard/Recruiter/changePositionDetails"
          : "/api/jobsDashboard/Recruiter/addNewJob",
        {
          method: jobId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      const data = await res.json();

      if (res.ok) {
        setSuccessMessage(
          "Position " + (jobId ? "Updated" : "Added") + " Successfully ✅"
        );
        if (!jobId) {
          setJob("");
          setJobType("");
          setCountry("");
          setLocation("");
          setDescription("");
          setQualifications("");
        }
        if (onSuccess) onSuccess();
      } else {
        setError(data.message || "Something went wrong");
      }
    } catch {
      setError("Something went wrong");
    }
  };

  if (loading || !user) return null;

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
          <select
            className="text-center ml-1 mt-1 w-80 h-10 border border-gray-300 rounded"
            value={job_type}
            onChange={(e) => setJobType(e.target.value)}
          >
            <option value="">Select job type</option>
            <option value="On Site">On Site</option>
            <option value="Hybrid">Hybrid</option>
            <option value="Remote">Remote</option>
          </select>
        </div>
        <div className="items-center">
          <input
            type="text"
            className="text-center ml-1 mt-1 w-80 h-10 border border-gray-300 rounded"
            placeholder="Country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          />
        </div>
        <div className="items-center">
          <input
            type="text"
            className="text-center ml-1 mt-1 w-80 h-10 border border-gray-300 rounded"
            placeholder="City"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        <div className="items-center">
          <textarea
            className="text-center ml-1 mt-1 w-80 h-32 border border-gray-300 rounded resize-none"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="items-center">
          <textarea
            className="text-center ml-1 mt-1 w-80 h-32 border border-gray-300 rounded resize-none"
            placeholder="Qualifications"
            value={qualifications}
            onChange={(e) => setQualifications(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="items-center mx-1 w-80 h-10 bg-blue-500 text-white p-1 rounded hover:bg-blue-600 mt-1"
        >
          {jobId ? "Save Changes" : "Add To My Dashboard"}
        </button>
        {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
        {successMessage && (
          <p className="text-green-600 text-sm mt-1 animate-fade-in">
            {successMessage}
          </p>
        )}
      </form>
    </div>
  );
};

export default AddNewPositionRecruiter;
