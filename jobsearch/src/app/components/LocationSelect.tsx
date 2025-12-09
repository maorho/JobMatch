"use client";
import React, { useState } from "react";
import type { Job } from "./JobTable";

interface LocationSelectProps {
  jobs: Job[];
  selectedCities: string[];
  setSelectedCities: React.Dispatch<React.SetStateAction<string[]>>;
}

export default function LocationSelect({
  jobs,
  selectedCities,
  setSelectedCities,
}: LocationSelectProps) {
  const [isOpen, setIsOpen] = useState(false);

  // ערים ייחודיות בלבד
  const uniqueCities = [...new Set(jobs.map((job) => job.city))];

  const toggleCity = (city: string) => {
    setSelectedCities((prev) =>
      prev.includes(city)
        ? prev.filter((c) => c !== city)
        : [...prev, city]
    );
  };

  return (
    <div className="relative bg-white/90 rounded-xl px-4 py-3 border border-gray-200 w-44 cursor-pointer select-none">
      {/* תצוגת כפתור */}
      <div
        className="flex items-center justify-between"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="text-gray-700 text-[15px] truncate">
          {selectedCities.length > 0
            ? selectedCities.join(", ")
            : "Location"}
        </span>
        <svg
          className={`w-4 h-4 text-gray-600 ml-2 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
          {uniqueCities.map((city, index) => (
            <label
              key={index}
              className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedCities.includes(city)}
                onChange={() => toggleCity(city)}
                className="mr-2 accent-blue-500"
              />
              <span className="text-gray-700 text-sm">{city}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
