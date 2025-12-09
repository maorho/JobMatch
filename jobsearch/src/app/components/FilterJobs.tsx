"use client";
import React from "react";
import { Job } from "./JobTable";
import { OpenNavIcon,CloseNavIcon,FilterIcon } from "./icons";



interface FilterRenderProps {
  title: string;
  options: string[];
  selected: string[];
  setSelected: (values: string[]) => void;
}
const FilterRender: React.FC<FilterRenderProps> = ({title, options, selected, setSelected})=>{
  const [isOpen, setIsOpen] = React.useState<boolean>(true);
  const toggleElement = (value: string) => {
    if (selected.includes(value)) {
      setSelected(selected.filter((v) => v !== value));
    } else {
      setSelected([...selected, value]);
    }
  };
  return (
    <div className="flex flex-col w-full">
      <div className="flex gap-38 items-center justify-between">
        <label className="font-medium text-[18px] lg:text-[20px] mb-1">
            {title}
          </label>
          {isOpen?<button onClick={() => setIsOpen && setIsOpen(false)}><OpenNavIcon/></button>:<button onClick={() => setIsOpen && setIsOpen(true)}><CloseNavIcon/></button>}
      </div>
           {isOpen && options.map((type) => (
            <label key={type} className="block font-outfit font-normal text-[#000000]/60">
              <input
                type="checkbox"
                checked={selected.includes(type)}
                onChange={() => toggleElement(type)}
                className="mx-2 my-4"
              />
              {type}
            </label>
          ))}
          
      </div>
  )
};
interface JobFiltersProps {
  jobs: Job[];
  company: string[];
  country: string[];
  city: string[];
  setCompany: React.Dispatch<React.SetStateAction<string[]>>;
  setCountry: React.Dispatch<React.SetStateAction<string[]>>;
  setCity: React.Dispatch<React.SetStateAction<string[]>>;
  isMobile: boolean;
}
export const BottomLine = () => (
  <div className="w-full border-[1px] border-[#000000]/10 h-[1px] my-4"></div>
);
export const JobsFilters: React.FC<JobFiltersProps> = ({
  jobs,
  company,
  country,
  city,
  setCompany,
  setCountry,
  setCity,
  isMobile,
}) => {
  const getUniqueValues = (arr: Job[], key: keyof Job) => {
    const values = arr
      .map((job) => {
        if (key === "company") {
          return typeof job.company === "object"
            ? job.company.companyName
            : job.company;
        }
        return (job[key] as unknown) as string;
      })
      .filter((value): value is string => typeof value === "string" && value.trim() !== "");
    return Array.from(new Set(values));
  };
  const uniqueCompanies = getUniqueValues(jobs, "company");
  const uniqueTypes = getUniqueValues(jobs, "country");
  const uniqueCities = getUniqueValues(jobs, "city");
  return (
    <div className={isMobile ? "flex flex-col rounded-4xl w-full max-w-[295px] h-full mx-auto":"flex flex-col border border-[#232323]/10 rounded-4xl w-full max-w-[295px] h-full mx-auto"}>
         <div className="flex w-full mt-4 gap-44 items-center justify-between">
              <label className="font-medium text-[18px] lg:text-[20px] ml-5">Filters</label>
              <FilterIcon />
          </div>
          <BottomLine />
    <div className="w-full flex flex-col justify-center">
      <div className="flex flex-col font-outfit md:flex-row flex-wrap gap-4 bg-white p-4 rounded max-w-5xl w-full">
        {/* Job Type Filter */}
        <FilterRender key={"job-type"} title="Job Type" options={uniqueTypes} selected={country} setSelected={setCountry} />
        <BottomLine />
        {/* City Filter */}
        <FilterRender key={"cities"} title="Cities" options={uniqueCities} selected={city} setSelected={setCity} />
        <BottomLine />
        {/* Company Filter */}
        <FilterRender key={"companies"} title="Companies" options={uniqueCompanies} selected={company} setSelected={setCompany} />
      </div>
    </div>
    </div>
  );
};

export default JobsFilters;