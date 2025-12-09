"use client";
import { useState } from "react";

const OutsideJobAdding = () => {
  const [job, setJob] = useState("");
  const [company, setCompany] = useState("");
  const [job_type, setJobType] = useState("");
  const [error, setError] = useState("");
  const typemodel =["Hybrid","Remote","On Site"];
  const [status,setStatus] = useState("");
  const statuses = ['Submitted Resume','Rejected', 'HR Phone Interview', 'Technical Interview', 'Accepted','Final Interview','Recived an Offer'];
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
          <select className="text-center ml-1 mt-1 w-80 h-10 border border-gray-300 rounded" onChange={(e)=>setJobType(e.target.value)}>
            {typemodel.map((e,ind)=>{
              return (<option className="text-center ml-1 mt-1 w-80 h-10 border border-gray-300 rounded" key={ind} value={e}>{e}</option>)
            })}
          </select>
        </div>
        <div className="items-center">
          <input
            type="text"
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
        <div className="items-center">
          <select className="text-center ml-1 mt-1 w-80 h-10 border border-gray-300 rounded" onChange={(e)=>setStatus(e.target.value)}>
            {statuses.map((e,ind)=>{
              return (<option className="text-center ml-1 mt-1 w-80 h-10 border border-gray-300 rounded" key={ind} value={e}>{e}</option>)
            })}
          </select>
        </div>
        <button
          type="submit"
          onSubmit={handleSubmit}
          className="items-center font-outfit mx-1 w-80 h-10 bg-[#24A8A2] text-white p-1 rounded hover:bg-[#1B7F7A] mt-1"
        >
          Add To My Dashboard
        </button>
      </form>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
};

export default OutsideJobAdding;
