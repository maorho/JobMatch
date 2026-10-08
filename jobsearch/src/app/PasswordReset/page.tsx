"use client";
import React, { useState } from "react";

function PasswordReset() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    // Prevent the default GET navigation that would leak the email into the URL.
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="ml-3 h-100 p-2 items-center">
      <h2 className="text-center w-1/2 mt-20 pl-10 m-auto font-semibold text-2xl text-blue-600">
        Password Reset
      </h2>

      <form onSubmit={handleSubmit}>
        <div className="items-center mx-100">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="text-center ml-1 mt-1 w-80 h-10 border border-gray-300 rounded"
            placeholder="Email"
          />
        </div>
        <button
          type="submit"
          className="items-center mx-101 mt-8 w-80 h-10 bg-blue-500 text-white p-1 rounded hover:bg-blue-600"
        >
          Reset
        </button>
      </form>

      {submitted && (
        <p className="text-center mt-6 text-gray-600">
          If an account exists for that email, you&apos;ll receive reset
          instructions. (Email-based reset is coming soon.)
        </p>
      )}
    </div>
  );
}

export default PasswordReset;
