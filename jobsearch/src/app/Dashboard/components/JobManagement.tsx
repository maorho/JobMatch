import React from "react";

interface Job {
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
  console.log(jobs);
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
                <td className="px-6 py-4 border-b">hello</td>
                <td className="px-6 py-4 border-b">hello</td>
                <td className="px-6 py-4 border-b">hello</td>
                <td className="px-6 py-4 border-b capitalize">hello</td>
                <td className="px-6 py-4 border-b">
                  {job.link ? (
                    <a
                      href={job.link}
                      target="_blank"
                      rel="noopener noreferrer"
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
