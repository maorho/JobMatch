import { useIsMobile } from "@/app/lib/hooks/useIsMobile";
import React, { useState } from "react";
import { isSelfAddedJob } from "../../../../utils/isSelfAddedJob";
import { DeleteIcon } from "@/app/components/icons";

interface Job {
  source: string;
  jobId: any;
  job: string;
  company: string;
  location: string;
  type: string;
  link?: string;
  status?: string;
}

interface JobManagementProps {
  jobs: any[];
}

const JobManagement: React.FC<JobManagementProps> = ({ jobs }) => {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 5; 
  const totalPages = Math.ceil(jobs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const displayedjobs = jobs.slice(
    startIndex,
    startIndex + itemsPerPage
  );
  const isMobile = useIsMobile();
  const colors_by_status : Record<string, string[]> = {
    "Submitted Resume": ["bg-[#DBEAFE]","text-[#1E40AF]"],
    "Rejected": ["bg--[#FEF9C3]","text-[#854D0E]"],
    "HR Phone Interview": ["bg-blue-400","text-[#FEF9C3]"],
    "Technical Interview": ["bg-purple-400","text-[#FEF9C3]"],
    "Final Interview": ["bg-[#FEF9C3]","text-[#854D0E]"],
    "Offer Recived": ["bg-[#DCFCE7]","text-[#166534]"],
    "Accepted": ["bg-[#FEE2E2]","text-[#991B1B]"],
  };

  const handleDeleteSelfJob = async (jobID:string) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this job?"
    );
    if (!confirmed) return;

    const res = await fetch(`api/jobsDashboard/Candidate/deleteSelfAddedJob?jobId=${jobID}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });

    if (res.ok) {
      alert("Job deleted");
      
    } else {
      alert("Something went wrong");
    }
  };
  return (
    <div className="flex justify-center items-start mb-20">
      <div className="w-full max-w-6xl bg-white rounded-lg shadow-lg p-6 overflow-x-auto">
        {!isMobile?(
          <table className="min-w-full table-auto border-collapse">
            <thead className="bg-[#11AEFF] text-white text-center lg:rounded-[8px]">
            <tr className="lg:rounded-[8px]">
              <th className="px-6 py-4 border-b">Job</th>
              <th className="px-6 py-4 border-b">Company</th>
              <th className="px-6 py-4 border-b">Location</th>
              <th className="px-6 py-4 border-b">Type</th>
              <th className="px-6 py-4 border-b">Link</th>
              <th className="px-6 py-4 border-b text-center">Status</th>
            </tr>
          </thead>   
          <tbody className="text-gray-700 font-medium">
            {displayedjobs.map((job, idx) => {
              const selfAdded = isSelfAddedJob(job);

              return (
                <tr key={idx} className="bg-white text-center">
                  <td className="px-6 py-4 border-b border-[#222222]/10 font-bold">
                    {selfAdded?
                      <div className="flex gap-10 items-center mx-auto">
                        <button onClick={()=> handleDeleteSelfJob(job._id)} >
                            <DeleteIcon color="#DC2626"/>
                          </button>
                          <p className="text-lg font-bold">{job.jobTitle}</p>
                          
                      </div>: <p className="text-lg font-bold">{selfAdded?job.jobTitle:job.jobId.job}</p>}
                  </td>

                  <td className="px-6 py-4 border-b border-[#222222]/10 font-normal">
                    {selfAdded
                      ? job.company
                      : job.source === "internal"
                      ? job.jobId.company.companyName
                      : job.jobId.company}
                  </td>

                  <td className="px-6 py-4 border-b border-[#222222]/10 font-normal">
                    {selfAdded ? job.location : job.jobId.country}
                  </td>

                  <td className="px-6 py-4 border-b border-[#222222]/10 capitalize">
                    {selfAdded ? job.jobType : job.source === "internal" ? job.jobId.type : "-"}
                  </td>

                  <td className="px-6 py-4 border-b border-[#222222]/10">
                    {selfAdded ? (
                      <a href={job.link} target="_blank" className="text-blue-600 underline hover:text-blue-800">
                        View
                      </a>
                    ) : job.source === "external" ? (
                      <a
                        href={job.jobId.finalUrl}
                        target="_blank"
                        className="text-blue-600 underline hover:text-blue-800"
                      >
                        View
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>

                  <td className="px-6 py-4 border-b border-[#222222]/10 font-normal">
                    <div
                      className={`w-40 h-7 rounded-2xl ${
                        colors_by_status[job.status] ? colors_by_status[job.status][0] : "bg-gray-300"
                      }`}
                    >
                      <label
                        className={
                          colors_by_status[job.status]
                            ? colors_by_status[job.status][1]
                            : "text-black"
                        }
                      >
                        {job.status || "-"}
                      </label>
                    </div>
                  </td>
                </tr>
                );
              })}
          </tbody>
        </table>
        ):(
           <div className="flex flex-col gap-4 items-center mb-5">
              {displayedjobs.map((job, idx) => {
                const selfAdded = isSelfAddedJob(job);
                return(
                <div
                  key={idx}
                  className="bg-white p-4 rounded-xl shadow  min-w-[300px] max-w-[450px] border border-gray-200 flex flex-col gap-2"
                >
                  {selfAdded?
                  <div className="flex gap-10">
                      <p className="text-lg font-bold">{job.jobTitle}</p>
                      <button onClick={()=> handleDeleteSelfJob(job._id)} >
                        <DeleteIcon color="#DC2626"/>
                      </button>
                  </div>: <p className="text-lg font-bold">{selfAdded?job.jobTitle:job.jobId.job}</p>}
                 

                  <p className="text-[14px] text-gray-700">
                    <strong>Company:</strong>{" "}
                    {selfAdded?job.company:job.source === "internal"
                      ? job.jobId.company.companyName
                      : job.jobId.company}
                  </p>

                  <p className="text-[14px] text-gray-700">
                    <strong>Location:</strong> {selfAdded?job.location:job.jobId.country}
                  </p>

                  <p className="text-[14px] text-gray-700">
                    <strong>Type:</strong>{" "}
                    {selfAdded?job.jobType:job.source === "internal" ? job.jobId.type : "-"}
                  </p>
                  
                  
                
                  <div
                    className={`px-3 py-1 rounded-full w-fit ${
                      colors_by_status[job.status || ""]?.[0] || "bg-gray-300"
                      }`}
                  >
                    <span
                        className={
                           colors_by_status[job.status || ""]?.[1] || "text-black"
                        }
                    >
                      {job.status}
                    </span>
                  </div>
                  
                    

                  {job.source === "external" && (
                    <a
                      href={selfAdded?job.link:job.jobId.finalUrl}
                      target="_blank"
                      className="text-blue-600 underline"
                    >
                      View Job
                    </a>
                  )}
                </div>
                ) 
              })}
            </div>
          )
        }
        
        <div className="flex justify-between items-center px-6 py-4 bg-white border-t border-gray-200 rounded-b-[14px]">
          {!isMobile&&
          <p className="text-sm text-gray-500">
            Showing {startIndex + 1}–
            {Math.min(startIndex + itemsPerPage, jobs.length)} of{" "}
            {jobs.length} candidates
          </p>
          }
          

          <div className={`flex items-center ${isMobile && 'mx-auto'} gap-2`}>
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
              className={`px-3 py-1 border rounded ${
                currentPage === 1
                  ? "text-gray-400 border-gray-200 cursor-not-allowed"
                  : "text-blue-600 border-gray-300 hover:bg-gray-100"
              }`}
            >
              Previous
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`px-3 py-1 border rounded ${
                  currentPage === page
                    ? "bg-blue-500 text-white border-blue-500"
                    : "text-gray-700 border-gray-300 hover:bg-gray-100"
                }`}
              >
                {page}
              </button>
            ))}

            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(currentPage + 1)}
              className={`px-3 py-1 border rounded ${
                currentPage === totalPages
                  ? "text-gray-400 border-gray-200 cursor-not-allowed"
                  : "text-blue-600 border-gray-300 hover:bg-gray-100"
              }`}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobManagement;
