"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

function SignUp() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recruiter, setRecruiter] = useState(false);
  const [company, setCompany] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!agree) {
      setError("You must agree to the terms");
      return;
    }

    if (email !== confirmEmail) {
      setError("Emails do not match");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (recruiter) {
      if (password.length < 1) {
        setError("Please state your company");
      }
    }
    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          fullname: fullName,
          username,
          recruiter,
          company,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        data.recruiter
          ? router.push("/RecruiterDashboard")
          : router.push("/Dashboard");
      } else {
        setError(data.message || "Signup failed");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex justify-center pt-20 min-h-screen p-4 bg-white">
      <div className="w-full max-w-md">
        <h2 className="text-center font-semibold text-2xl text-blue-600 mb-2">
          Want to accelerate your job search?
        </h2>
        <h2 className="text-center font-semibold text-2xl text-blue-600 mb-6">
          Sign Up Now
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            className="block w-full h-10 border border-gray-300 rounded px-3 text-center"
            placeholder="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />

          <input
            type="text"
            className="block w-full h-10 border border-gray-300 rounded px-3 text-center"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <input
            type="email"
            className="block w-full h-10 border border-gray-300 rounded px-3 text-center"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="email"
            className="block w-full h-10 border border-gray-300 rounded px-3 text-center"
            placeholder="Confirm Email"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
          />

          <input
            type="password"
            className="block w-full h-10 border border-gray-300 rounded px-3 text-center"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <input
            type="password"
            className="block w-full h-10 border border-gray-300 rounded px-3 text-center"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={recruiter}
              onChange={() => setRecruiter(!recruiter)}
            />
            <label className="text-sm">I'm a recruiter</label>
          </div>
          <input
            type="text"
            className="block w-full h-10 border border-gray-300 rounded px-3 text-center"
            placeholder="Company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={agree}
              onChange={() => setAgree(!agree)}
            />
            <label className="text-sm">
              I agree to{" "}
              <Link
                href="/TermsOfConditions"
                className="font-semibold text-blue-600 hover:underline"
              >
                Terms Of Conditions
              </Link>
            </label>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className={`w-full h-10 text-white rounded ${
              loading
                ? "bg-blue-300 cursor-not-allowed"
                : "bg-blue-500 hover:bg-blue-600"
            }`}
          >
            {loading ? "Submitting..." : "Submit"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default SignUp;
