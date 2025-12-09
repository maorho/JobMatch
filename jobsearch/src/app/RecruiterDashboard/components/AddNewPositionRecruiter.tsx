import { useCurrentUser } from "@/app/lib/hooks/useCurrentUser";
import React, { useState, useEffect } from "react";

interface AddNewPositionRecruiterProps {
  jobId?: string;
  onSuccess?: () => void;
  setShowModal: React.Dispatch<React.SetStateAction<boolean>>;
  edit?: boolean;
}
const CloseIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="bg-red"
  >
    <path
      d="M15.5735 2.42596C15.7068 2.29689 15.8132 2.14246 15.8864 1.9717C15.9597 1.80095 15.9982 1.61727 15.9999 1.43139C16.0016 1.24551 15.9664 1.06116 15.8963 0.889084C15.8262 0.717008 15.7227 0.560657 15.5917 0.429155C15.4608 0.297653 15.305 0.193632 15.1335 0.123162C14.9621 0.0526925 14.7783 0.0171858 14.593 0.0187128C14.4077 0.0202398 14.2246 0.0587703 14.0543 0.132056C13.884 0.205342 13.73 0.311916 13.6012 0.445559L8.0079 6.05452L2.4165 0.445559C2.28874 0.30802 2.13468 0.197703 1.9635 0.12119C1.79231 0.0446766 1.60752 0.0035343 1.42014 0.000217862C1.23276 -0.00309858 1.04664 0.0314789 0.872873 0.101887C0.699106 0.172295 0.541256 0.277091 0.40874 0.410024C0.276223 0.542956 0.171755 0.701301 0.101568 0.875614C0.0313803 1.04993 -0.00308888 1.23664 0.00021718 1.4246C0.00352324 1.61257 0.0445368 1.79794 0.12081 1.96966C0.197084 2.14138 0.307055 2.29593 0.444164 2.42409L6.03184 8.03492L0.440443 13.6439C0.193938 13.9093 0.0597379 14.2603 0.0661168 14.6229C0.0724956 14.9856 0.218955 15.3316 0.474639 15.5881C0.730323 15.8446 1.07527 15.9915 1.4368 15.9979C1.79834 16.0043 2.14824 15.8697 2.41278 15.6224L8.0079 10.0135L13.5993 15.6243C13.8638 15.8716 14.2137 16.0062 14.5753 15.9998C14.9368 15.9934 15.2818 15.8465 15.5374 15.59C15.7931 15.3335 15.9396 14.9875 15.946 14.6248C15.9523 14.2621 15.8181 13.9111 15.5716 13.6457L9.98396 8.03492L15.5735 2.42596Z"
      fill="#FF0000"
    />
  </svg>
);
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
    <div className="p-2 items-center">
      <div className="flex justify-between items-center mb-8 w-full">
        <div>
          <label className="text-[22px] lg:text-[32px] font-outfit font-medium">
            Create Job Listing
          </label>
        </div>

        {edit ?? (
          <button className="items-right" onClick={() => setShowModal(false)}>
            <CloseIcon />
          </button>
        )}
      </div>
      <form onSubmit={handleSubmit} className="max-h-[60vh] overflow-y-auto">
        <div className="flex flex-col mb-5">
          <label className="text-left font-medium font-outfit text-[14px] lg:text-[16px]">
            Job Title
          </label>
          <input
            type="text"
            className="pl-5 mt-2 w-full h-[44px] rounded-[8px] lg:rounded-[14px] border border-gray-300"
            placeholder="Enter title"
            value={job}
            onChange={(e) => setJob(e.target.value)}
          />
        </div>
        <div className="flex flex-col mb-5">
          <label className="text-left font-medium font-outfit text-[14px] lg:text-[16px]">
            Job Type
          </label>
          <select
            className="pl-5 mt-2 w-full h-[44px] rounded-[8px] lg:rounded-[14px] border border-gray-300"
            value={job_type}
            onChange={(e) => setJobType(e.target.value)}
          >
            <option value="">Select Job Type</option>
            <option value="On Site">On Site</option>
            <option value="Hybrid">Hybrid</option>
            <option value="Remote">Remote</option>
          </select>
        </div>
        <div className="flex flex-col mb-5">
          <label className="text-left font-medium font-outfit text-[14px] lg:text-[16px]">
            Country
          </label>
          <input
            type="text"
            className="pl-5 mt-2 w-full h-[44px] rounded-[8px] lg:rounded-[14px] border border-gray-300"
            placeholder="Enter Country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          />
        </div>
        <div className="flex flex-col mb-5">
          <label className="text-left font-medium font-outfit text-[14px] lg:text-[16px]">
            City
          </label>
          <input
            type="text"
            className="pl-5 mt-2 w-full h-[44px] rounded-[8px] lg:rounded-[14px] border border-gray-300"
            placeholder="Enter City"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
        <div className="flex flex-col mb-5">
          <label className="text-left font-medium font-outfit text-[14px] lg:text-[16px]">
            Job Description
          </label>
          <textarea
            className="pl-5 mt-2 w-full h-25 lg:h-32 rounded-[8px] lg:rounded-[14px] border border-gray-300"
            placeholder="Describe Your Post..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex flex-col mb-5">
          <label className="text-left font-medium font-outfit text-[14px] lg:text-[16px]">
            Required Qualifications
          </label>
          <textarea
            className="pl-5 mt-2 w-full lg:h-32 rounded-[8px] lg:rounded-[14px] border border-gray-300 h-25"
            placeholder="Describe Your Post..."
            value={qualifications}
            onChange={(e) => setQualifications(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="font-outfit font-normal items-center mx-1 w-full rounded-[8px] lg:rounded-[14px] h-12 lg:h-14 bg-[#24A8A2] text-white p-1 hover:bg-blue-600 mt-7"
        >
          {jobId ? "Save Changes" : "Save & Add to Dashboard"}
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