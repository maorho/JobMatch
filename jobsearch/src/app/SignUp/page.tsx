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
  const [phone, setPhone] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [recruiter, setRecruiter] = useState(false);
  const [company, setCompany] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!agree) return setError("You must agree to the terms");
    if (email !== confirmEmail) return setError("Emails do not match");
    if (password !== confirmPassword) return setError("Passwords do not match");
    if (password.length < 6)
      return setError("Password must be at least 6 characters");
    if (recruiter && company.trim() === "")
      return setError("Please enter your company name");
    if (!resumeFile) return setError("Please upload your resume");

    setLoading(true);

    const formData = new FormData();
    formData.append("email", email);
    formData.append("password", password);
    formData.append("fullname", fullName);
    formData.append("username", username);
    formData.append("phone", phone);
    formData.append("recruiter", String(recruiter));
    formData.append("company", company);
    formData.append("resume", resumeFile);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        router.push(data.recruiter ? "/RecruiterDashboard" : "/Dashboard");
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
    <div className="flex pt-20 min-h-183 p-4 justify-center bg-white">
      <div className="w-full max-w-md">
        <h2 className="text-center font-semibold text-2xl text-blue-600 mb-6">
          Sign Up Now
        </h2>

        <form
          onSubmit={handleSubmit}
          className="space-y-3"
          encType="multipart/form-data"
        >
          <div className="grid grid-flow-col justify-items-center">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="text-center m-1 w-80 h-10 border border-gray-300 rounded"
            />
          </div>
          <div className="grid grid-flow-col justify-items-center">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="text-center m-1 w-80 h-10 border border-gray-300 rounded"
            />
          </div>
          <div className="grid grid-flow-col justify-items-center">
            <input
              type="email"
              placeholder="Confirm Email"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              className="text-center m-1 w-80 h-10 border border-gray-300 rounded"
            />
          </div>
          <div className="grid grid-flow-col justify-items-center">
            <input
              type="tel"
              placeholder="Phone Number"
              value={phone}
              pattern="[0-9]{10}"
              onChange={(e) => setPhone(e.target.value)}
              className="text-center m-1 w-80 h-10 border border-gray-300 rounded"
              required
            />
          </div>
          <div className="grid grid-flow-col justify-items-center">
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              required
              onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
              className="input"
            />
          </div>
          <div className="grid grid-flow-col justify-items-center">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="text-center m-1 w-80 h-10 border border-gray-300 rounded"
            />
          </div>
          <div className="grid grid-flow-col justify-items-center">
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="text-center m-1 w-80 h-10 border border-gray-300 rounded"
            />
          </div>
          <div className="grid grid-flow-col justify-items-center">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={recruiter}
                onChange={() => setRecruiter(!recruiter)}
              />
              <label className="text-sm">I'm a recruiter</label>
            </div>
          </div>
          <div className="grid grid-flow-col justify-items-center">
            {recruiter && (
              <input
                type="text"
                placeholder="Company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="text-center m-1 w-80 h-10 border border-gray-300 rounded"
              />
            )}
          </div>
          <div className="grid grid-flow-col justify-items-center">
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
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="grid grid-flow-col justify-items-center">
            <button
              type="submit"
              disabled={loading}
              className={`w-80 h-10 text-white rounded ${
                loading
                  ? "bg-blue-300 cursor-not-allowed"
                  : "bg-blue-500 hover:bg-blue-600"
              }`}
            >
              {loading ? "Submitting..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SignUp;
