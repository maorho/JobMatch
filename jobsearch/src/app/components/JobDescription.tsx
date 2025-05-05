import React from "react";

interface JobDescriptionProps {
  job: any;
}
const JobDescription: React.FC<JobDescriptionProps> = ({ job }) => {
  const qualifications_arr = job.qualifications.split(", ");
  return (
    <div className="shadow-xl p-5 w-150 m-auto">
      <h2 className="ml-2 py-2 text-2xl font-semibold">{job.job}</h2>
      <div className="ml-4">
        <h3>
          <span className="font-semibold">company:</span>
          {job.company}
        </h3>
        <div>
          <div>
            <h3 className="font-semibold">Description</h3>
            <p className="ml-1">{job.description}</p>
          </div>
          <div>
            <h3 className="font-semibold">Qualifications:</h3>
            <ol>
              {qualifications_arr.map((elem: string, index: number) => (
                <li className="ml-1" key={index}>
                  {elem}
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="flex font-semibold">
          <h3 className="mr-2">{job.type}</h3>
          <h3>{job.location}</h3>
        </div>
        <button className="mt-2 w-20 h-7 bg-blue-500 text-white rounded hover:bg-green-600">
          Apply
        </button>
      </div>
    </div>
  );
};

export default JobDescription;
