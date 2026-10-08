"use client";
import { useState } from "react";

const OutsideJobAdding = () => {
  const typemodel =["Hybrid","Remote","On Site"];
  const statuses = ['Submitted Resume','Rejected', 'HR Phone Interview', 'Technical Interview', 'Accepted','Final Interview','Recived an Offer'];
  const [job, setJob] = useState("");
  const [company, setCompany] = useState("");
  // Default to the first option so the submitted value matches what the UI shows.
  const [job_type, setJobType] = useState(typemodel[0]);
  const [error, setError] = useState("");
  const [status,setStatus] = useState(statuses[0]);
  const [link, setLink] = useState("");
  const [location, setLocation] = useState("");
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (job.length == 0) return setError("Job title is missing");
    if (company.length == 0) return setError("Company name is missing");
    if (location.length == 0) return setError("Please specify a location");
    if (link.length == 0) return setError("Please add a link for this position");

    const formData = new FormData();
    formData.append("jobtitle",job);
    formData.append("company",company);
    formData.append("jobtype",job_type);
    formData.append("location",location);
    formData.append("link",link);
    formData.append("status",status);

    try{
      const res = await fetch("api/jobsDashboard/Candidate/outsideJobAddingByCandidate",{
        method:"POST",
        body:formData,
      });

      if(res.ok){
        alert("job added succefully");
      }
    }
    catch{
      setError("Job adding failed");
    }
  }


  return (
    <div className="space-y-5">
      <h2 className="jm-h2">Add New Job</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="osj-job" className="jm-label">Job</label>
            <input
              id="osj-job"
              type="text"
              className="jm-input"
              placeholder="Job"
              value={job}
              onChange={(e) => setJob(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="osj-company" className="jm-label">Company</label>
            <input
              id="osj-company"
              type="text"
              className="jm-input"
              placeholder="Company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="osj-type" className="jm-label">Job type</label>
            <select id="osj-type" className="jm-input jm-select" value={job_type} onChange={(e)=>setJobType(e.target.value)}>
              {typemodel.map((e,ind)=>{
                return (<option key={ind} value={e}>{e}</option>)
              })}
            </select>
          </div>
          <div>
            <label htmlFor="osj-location" className="jm-label">Location</label>
            <input
              id="osj-location"
              type="text"
              className="jm-input"
              placeholder="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="osj-link" className="jm-label">Link</label>
            <input
              id="osj-link"
              type="text"
              className="jm-input"
              placeholder="Link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="osj-status" className="jm-label">Status</label>
            <select id="osj-status" className="jm-input jm-select" value={status} onChange={(e)=>setStatus(e.target.value)}>
              {statuses.map((e,ind)=>{
                return (<option key={ind} value={e}>{e}</option>)
              })}
            </select>
          </div>
        </div>
        <button
          type="submit"
          onSubmit={handleSubmit}
          className="jm-btn jm-btn-primary w-full"
        >
          Add To My Dashboard
        </button>
      </form>
      {error && <p className="jm-alert jm-alert-err">{error}</p>}
    </div>
  );
};

export default OutsideJobAdding;
