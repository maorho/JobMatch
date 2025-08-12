import React from "react";

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
  jobs: Job[];
}

const JobManagement: React.FC<JobManagementProps> = ({ jobs }) => {
  return (
    <div className="flex justify-center items-start min-h-screen bg-gray-100 py-10">
      <div className="w-full max-w-6xl bg-white rounded-lg shadow-lg p-6 overflow-x-auto">
        <h2 className="text-2xl font-bold text-blue-600 mb-6 text-center">
          Job Seeking Management
        </h2>
        <table className="min-w-full table-auto border-collapse">
          <thead className="bg-blue-500 text-white text-left">
            <tr>
              <th className="px-6 py-4 border-b">Job</th>
              <th className="px-6 py-4 border-b">Company</th>
              <th className="px-6 py-4 border-b">Location</th>
              <th className="px-6 py-4 border-b">Type</th>
              <th className="px-6 py-4 border-b">Link</th>
              <th className="px-6 py-4 border-b">Status</th>
            </tr>
          </thead>
          <tbody className="text-gray-700">
            {jobs.map((job, idx) => (
              <tr
                key={idx}
                className={idx % 2 === 0 ? "bg-gray-50" : "bg-white"}
              >
                <td className="px-6 py-4 border-b">{job.jobId.job}</td>
                <td className="px-6 py-4 border-b">
                  {job.source === "internal"
                    ? job.jobId.company.companyName
                    : job.jobId.company}
                </td>
                <td className="px-6 py-4 border-b">{job.jobId.country}</td>
                <td className="px-6 py-4 border-b capitalize">
                  {job.source === "internal" ? job.jobId.type : "-"}
                </td>
                <td className="px-6 py-4 border-b">
                  {job.source === "external" ? (
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
                <td className="px-6 py-4 border-b">{job.status || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default JobManagement;
