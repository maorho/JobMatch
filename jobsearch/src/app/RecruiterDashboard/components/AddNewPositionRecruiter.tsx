import { useCurrentUser } from "@/app/lib/hooks/useCurrentUser";
import { useT } from "@/app/lib/i18n/LanguageProvider";
import type { Key } from "@/app/lib/i18n/dict";
import React, { useState, useEffect } from "react";
import { X } from "lucide-react";

// A form message is either one of our dictionary keys (translated at render, so it follows a
// language switch) or raw text that came back from the server.
type Msg = { key: Key } | { text: string } | null;

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
  const { t } = useT();
  const { user, loading } = useCurrentUser();
  const [job, setJob] = useState("");
  const [company, setCompany] = useState("");
  const [job_type, setJobType] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [description, setDescription] = useState("");
  const [qualifications, setQualifications] = useState("");
  const [publisher, setPublisher] = useState("");
  const [error, setError] = useState<Msg>(null);
  const [successMessage, setSuccessMessage] = useState<Msg>(null);
  const show = (m: Msg) => (m ? ("key" in m ? t(m.key) : m.text) : "");

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
          setError(data.message ? { text: data.message } : { key: "recruiter.form.loadFail" });
        }
      } catch {
        setError({ key: "recruiter.form.fetchErr" });
      }
    }
    fetchJobData();
  }, [jobId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (job === "") return setError({ key: "recruiter.form.reqTitle" });
    if (job_type === "") return setError({ key: "recruiter.form.reqType" });
    if (country === "") return setError({ key: "recruiter.form.reqCountry" });
    if (city === "") return setError({ key: "recruiter.form.reqCity" });
    if (description === "") return setError({ key: "recruiter.form.reqDescription" });
    if (qualifications === "")
      return setError({ key: "recruiter.form.reqQualifications" });

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
        setSuccessMessage({ key: jobId ? "recruiter.form.updated" : "recruiter.form.added" });
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
        setError(data.message ? { text: data.message } : { key: "recruiter.form.error" });
      }
    } catch {
      setError({ key: "recruiter.form.error" });
    }
  };

  if (loading || !user) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <h2 className="jm-h2">
          {t(jobId ? "recruiter.form.editTitle" : "recruiter.form.title")}
        </h2>

        {edit ?? (
          <button
            type="button"
            className="jm-btn jm-btn-ghost jm-btn-icon h-9 w-9 shrink-0"
            onClick={() => setShowModal(false)}
            aria-label={t("recruiter.form.close")}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="anp-job" className="jm-label">
              {t("recruiter.form.jobTitle")}
            </label>
            <input
              id="anp-job"
              type="text"
              className="jm-input"
              placeholder={t("recruiter.form.jobTitlePh")}
              value={job}
              onChange={(e) => setJob(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="anp-type" className="jm-label">
              {t("recruiter.form.jobType")}
            </label>
            <select
              id="anp-type"
              className="jm-input jm-select"
              value={job_type}
              onChange={(e) => setJobType(e.target.value)}
            >
              <option value="">{t("recruiter.form.selectType")}</option>
              <option value="On Site">{t("mode.On Site")}</option>
              <option value="Hybrid">{t("mode.Hybrid")}</option>
              <option value="Remote">{t("mode.Remote")}</option>
            </select>
          </div>
          <div>
            <label htmlFor="anp-country" className="jm-label">
              {t("recruiter.form.country")}
            </label>
            <input
              id="anp-country"
              type="text"
              className="jm-input"
              placeholder={t("recruiter.form.countryPh")}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="anp-city" className="jm-label">
              {t("recruiter.form.city")}
            </label>
            <input
              id="anp-city"
              type="text"
              className="jm-input"
              placeholder={t("recruiter.form.cityPh")}
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="anp-description" className="jm-label">
              {t("recruiter.form.description")}
            </label>
            <textarea
              id="anp-description"
              className="jm-input min-h-28 lg:min-h-32 resize-y"
              placeholder={t("recruiter.form.descriptionPh")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="anp-qualifications" className="jm-label">
              {t("recruiter.form.qualifications")}
            </label>
            <textarea
              id="anp-qualifications"
              className="jm-input min-h-28 lg:min-h-32 resize-y"
              placeholder={t("recruiter.form.qualificationsPh")}
              value={qualifications}
              onChange={(e) => setQualifications(e.target.value)}
            />
          </div>
        </div>
        <button
          type="submit"
          className="jm-btn jm-btn-primary w-full"
        >
          {t(jobId ? "recruiter.form.save" : "recruiter.form.saveAdd")}
        </button>
        {error && <p className="jm-alert jm-alert-err">{show(error)}</p>}
        {successMessage && (
          <p className="jm-alert jm-alert-ok animate-fade-in">
            {show(successMessage)}
          </p>
        )}
      </form>
    </div>
  );
};

export default AddNewPositionRecruiter;
