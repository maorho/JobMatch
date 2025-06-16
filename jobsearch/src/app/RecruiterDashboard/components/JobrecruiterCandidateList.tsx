import React, { useEffect, useState } from "react";

interface JobrecruiterCandidateListProps {
  jobId: string;
  company: string;
  updateStatuses: Map<string, string>;
  setUpdatedStatuses: React.Dispatch<React.SetStateAction<Map<string, string>>>;
}

interface Candidate {
  candidateId: {
    _id: string;
    fullname: string;
    email: string;
    phone: string;
    resume: string;
  };
  status: string;
}

const JobrecruiterCandidateList: React.FC<JobrecruiterCandidateListProps> = ({
  jobId,
  company,
  updateStatuses,
  setUpdatedStatuses,
}) => {
  const [candidates, setCadidates] = useState<Candidate[]>([]);
  const candidateList = async () => {
    try {
      const res = await fetch(
        `/api/jobsDashboard/Recruiter/jobsOverallCandidates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId: jobId,
            companyName: company,
          }),
        }
      );
      if (!res.ok) {
        throw new Error(`felid to fetch candidates`);
      }

      const data = await res.json();
      setCadidates(data);
    } catch {
      throw new Error("something went wrong");
    }
  };
  useEffect(() => {
    candidateList();
  }, []);

  useEffect(() => {
    if (updateStatuses.size === 0) return;

    const updated = candidates.map((candidate) => {
      const newStatus = updateStatuses.get(candidate.candidateId._id);
      if (newStatus && newStatus !== candidate.status) {
        return {
          ...candidate,
          status: newStatus,
        };
      }
      return candidate;
    });

    setCadidates(updated);
  }, [updateStatuses]);

  const setStatus = (
    userID: string,
    newStatus: string,
    originalStatus: string
  ) => {
    if (newStatus !== originalStatus) {
      const newMap = new Map(updateStatuses);
      console.log(userID);
      newMap.set(userID, newStatus);
      setUpdatedStatuses(newMap);
    }
  };
  return (
    <div className="flex justify-center items-start min-h-screen mt-5 bg-gray-100">
      <table className="min-w-full table-auto border-collapse">
        <thead className="bg-blue-500 text-white text-left">
          <tr>
            <td className="font-semibold px-6 py-4 border-b text-center">
              Full Name
            </td>
            <td className="font-semibold px-6 py-4 border-b text-center">
              Email
            </td>
            <td className="font-semibold px-6 py-4 border-b text-center">
              Phone
            </td>
            <td className="font-semibold px-6 py-4 border-b text-center">
              Resume Link
            </td>
            <td className="font-semibold px-6 py-4 border-b text-center">
              Status
            </td>
          </tr>
        </thead>
        <tbody>
          {candidates.map((candidate, ind) => {
            console.log(candidate.candidateId);
            return (
              <tr
                key={ind}
                className={ind % 2 === 0 ? "bg-gray-50" : "bg-white"}
              >
                <td className="px-6 py-4 border-b text-center">
                  {candidate.candidateId.fullname}
                </td>
                <td className="px-6 py-4 border-b text-center">
                  {candidate.candidateId.email}
                </td>
                <td className="px-6 py-4 border-b text-center">
                  {candidate.candidateId.phone}
                </td>
                <td className="px-6 py-4 border-b text-center">
                  <a
                    href={candidate.candidateId.resume}
                    className="text-blue-600 underline hover:text-blue-800"
                  >
                    Resume
                  </a>
                </td>
                <td className="px-6 py-4 border-b text-center">
                  <select
                    className="text-center ml-1 mt-1 w-80 h-10 border border-gray-300 rounded"
                    value={
                      updateStatuses.get(candidate.candidateId._id) ||
                      candidate.status
                    }
                    onChange={(e) =>
                      setStatus(
                        candidate.candidateId._id,
                        e.target.value,
                        candidate.status
                      )
                    }
                  >
                    <option value={candidate.status}>{candidate.status}</option>
                    <option value="Rejected">Rejected</option>
                    <option value="HR Phone Interview">
                      HR Phone Interview
                    </option>
                    <option value="Technical Interview">
                      Technical Interview
                    </option>
                    <option value="Final Interview">Final Interview</option>
                    <option value="Recived an Offer">Recived an Offer</option>
                    <option value="Accepted">Accepted</option>
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default JobrecruiterCandidateList;
