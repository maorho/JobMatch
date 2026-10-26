import { useCurrentUser } from "@/app/lib/hooks/useCurrentUser";
import React, { useState, useEffect } from "react";
import { X } from "lucide-react";

interface AddNewPositionRecruiterProps {
  jobId?: string;
  onSuccess?: () => void;
  setShowModal: React.Dispatch<React.SetStateAction<boolean>>;
  edit?: boolean;
}

const AddNewPositionRecruiter: React.FC<AddNewPositionRecruiterProps> = ({
  jobId,
  onSuccess,
  setShowModal,
  edit,
}) => {
  const { user, loading } = useCurrentUser();
  const [job, setJob] = useState("");
  const [company, setCompany] = useState("");
  const [job_type, setJobType] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [description, setDescription] = useState("");
  const [qualifications, setQualifications] = useState("");
  const [publisher, setPublisher] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Seed company/publisher from the signed-in user once per user, during
  // render (React's adjust-state-on-prop-change pattern) rather than in an
  // effect, so the form never paints a frame with empty values first.
  const [seededForUser, setSeededForUser] = useState<string | null>(null);
  if (user && (user.id || "") !== seededForUser) {
    setSeededForUser(user.id || "");
    setCompany(user.company || "");
    setPublisher(user.id || "");
  }

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
          setCity(data.city);
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
    if (city === "") return setError("City is required");
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
              city,
              description,
              qualifications,
            },
          }
        : {
            job,
            company,
            type: job_type,
            city,
            country,
            link: null,
            outsidesource: false,
            description,
            qualifications,
            publisher,
          };
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
          setCity("");
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
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <h2 className="jm-h2">
          Create Job Listing
        </h2>

        {edit ?? (
          <button
            type="button"
            className="jm-btn jm-btn-ghost jm-btn-icon h-9 w-9 shrink-0"
            onClick={() => setShowModal(false)}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="anp-job" className="jm-label">
              Job Title
            </label>
            <input
              id="anp-job"
              type="text"
              className="jm-input"
              placeholder="Enter title"
              value={job}
              onChange={(e) => setJob(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="anp-type" className="jm-label">
              Job Type
            </label>
            <select
              id="anp-type"
              className="jm-input jm-select"
              value={job_type}
              onChange={(e) => setJobType(e.target.value)}
            >
              <option value="">Select Job Type</option>
              <option value="On Site">On Site</option>
              <option value="Hybrid">Hybrid</option>
              <option value="Remote">Remote</option>
            </select>
          </div>
          <div>
            <label htmlFor="anp-country" className="jm-label">
              Country
            </label>
            <input
              id="anp-country"
              type="text"
              className="jm-input"
              placeholder="Enter Country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="anp-city" className="jm-label">
              City
            </label>
            <input
              id="anp-city"
              type="text"
              className="jm-input"
              placeholder="Enter City"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="anp-description" className="jm-label">
              Job Description
            </label>
            <textarea
              id="anp-description"
              className="jm-input min-h-28 lg:min-h-32 resize-y"
              placeholder="Describe Your Post..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="anp-qualifications" className="jm-label">
              Required Qualifications
            </label>
            <textarea
              id="anp-qualifications"
              className="jm-input min-h-28 lg:min-h-32 resize-y"
              placeholder="Describe Your Post..."
              value={qualifications}
              onChange={(e) => setQualifications(e.target.value)}
            />
          </div>
        </div>
        <button
          type="submit"
          className="jm-btn jm-btn-primary w-full"
        >
          {jobId ? "Save Changes" : "Save & Add to Dashboard"}
        </button>
        {error && <p className="jm-alert jm-alert-err">{error}</p>}
        {successMessage && (
          <p className="jm-alert jm-alert-ok animate-fade-in">
            {successMessage}
          </p>
        )}
      </form>
    </div>
  );
};

export default AddNewPositionRecruiter;
