"use client";
import { useState } from "react";
import { InlineNotice } from "@/app/components/Dialog";
import { useT } from "@/app/lib/i18n/LanguageProvider";
import { STATUS_LABEL_KEY, TYPE_LABEL_KEY } from "@/app/lib/i18n/dict/dashboard";

// Stored values stay English (they are what the API and the status chips key on);
// only the option labels follow the interface language.
const typemodel = Object.keys(TYPE_LABEL_KEY) as (keyof typeof TYPE_LABEL_KEY)[];
const statuses = ["Submitted Resume", "Rejected", "HR Phone Interview", "Technical Interview", "Accepted", "Final Interview", "Recived an Offer"] as const;

const OutsideJobAdding = ({ onAdded }: { onAdded?: () => void }) => {
  const { t } = useT();
  const [job, setJob] = useState("");
  const [company, setCompany] = useState("");
  // Default to the first option so the submitted value matches what the UI shows.
  const [job_type, setJobType] = useState<string>(typemodel[0]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [status,setStatus] = useState<string>(statuses[0]);
  const [link, setLink] = useState("");
  const [location, setLocation] = useState("");
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (job.length == 0) return setError(t("dashboard.add.errJob"));
    if (company.length == 0) return setError(t("dashboard.add.errCompany"));
    if (location.length == 0) return setError(t("dashboard.add.errLocation"));
    if (link.length == 0) return setError(t("dashboard.add.errLink"));

    const formData = new FormData();
    formData.append("jobtitle",job);
    formData.append("company",company);
    formData.append("jobtype",job_type);
    formData.append("location",location);
    formData.append("link",link);
    formData.append("status",status);

    setSaving(true);
    try{
      const res = await fetch("/api/jobsDashboard/Candidate/outsideJobAddingByCandidate",{
        method:"POST",
        body:formData,
      });

      if(res.ok){
        setSuccess(t("dashboard.add.success"));
        setJob(""); setCompany(""); setLocation(""); setLink("");
        onAdded?.(); // refresh the applications list right away
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d?.message || t("dashboard.add.failed"));
      }
    }
    catch{
      setError(t("dashboard.add.failed"));
    }
    finally{
      setSaving(false);
    }
  }


  return (
    <div className="space-y-5">
      <h2 className="jm-h2">{t("dashboard.add.title")}</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="osj-job" className="jm-label">{t("dashboard.add.job")}</label>
            <input
              id="osj-job"
              type="text"
              className="jm-input"
              placeholder={t("dashboard.add.job")}
              value={job}
              onChange={(e) => setJob(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="osj-company" className="jm-label">{t("dashboard.add.company")}</label>
            <input
              id="osj-company"
              type="text"
              className="jm-input"
              placeholder={t("dashboard.add.company")}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="osj-type" className="jm-label">{t("dashboard.add.type")}</label>
            <select id="osj-type" className="jm-input jm-select" value={job_type} onChange={(e)=>setJobType(e.target.value)}>
              {typemodel.map((e)=>{
                return (<option key={e} value={e}>{t(TYPE_LABEL_KEY[e])}</option>)
              })}
            </select>
          </div>
          <div>
            <label htmlFor="osj-location" className="jm-label">{t("dashboard.add.location")}</label>
            <input
              id="osj-location"
              type="text"
              className="jm-input"
              placeholder={t("dashboard.add.location")}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="osj-link" className="jm-label">{t("dashboard.add.link")}</label>
            <input
              id="osj-link"
              type="text"
              className="jm-input"
              placeholder={t("dashboard.add.link")}
              dir="ltr"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="osj-status" className="jm-label">{t("dashboard.add.status")}</label>
            <select id="osj-status" className="jm-input jm-select" value={status} onChange={(e)=>setStatus(e.target.value)}>
              {statuses.map((e)=>{
                return (<option key={e} value={e}>{t(STATUS_LABEL_KEY[e])}</option>)
              })}
            </select>
          </div>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="jm-btn jm-btn-primary w-full"
        >
          {saving ? t("dashboard.add.adding") : t("dashboard.add.submit")}
        </button>
      </form>
      {error && <p className="jm-alert jm-alert-err" role="alert">{error}</p>}
      {success && (
        <InlineNotice kind="ok" onDismiss={() => setSuccess("")}>
          {success}
        </InlineNotice>
      )}
    </div>
  );
};

export default OutsideJobAdding;
