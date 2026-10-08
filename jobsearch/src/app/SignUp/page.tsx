"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FcGoogle } from "react-icons/fc";
import { FaFacebook } from "react-icons/fa";

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
  const [admin] = useState(false); // admin is never self-granted at signup
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
    if (!resumeFile && !admin) return setError("Please upload your resume");

    setLoading(true);

    const formData = new FormData();
    formData.append("email", email);
    formData.append("password", password);
    formData.append("fullname", fullName);
    formData.append("username", username);
    formData.append("phone", phone);
    formData.append("recruiter", String(recruiter));
    formData.append("admin", String(admin));
    formData.append("company", company);
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    resumeFile && formData.append("resume", resumeFile);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        router.push(
          data.recruiter
            ? "/RecruiterDashboard"
            : data.admin
            ? "/AdminDashboard"
            : "/onboarding"
        );
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
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-2">
      {/* Mobile banner (image panel is full-height on lg) */}
      <div className="relative h-36 sm:h-44 lg:hidden overflow-hidden">
        <Image
          src="/signup_image.png"
          alt="Singup background"
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/60 to-navy/20" />
        <p className="absolute bottom-4 inset-x-4 sm:inset-x-6 text-white text-sm sm:text-base font-medium">
          Let the right jobs find you.
        </p>
      </div>

      {/* Form column */}
      <div className="flex flex-col px-4 sm:px-6 lg:px-12 py-6 sm:py-8 lg:py-10">
        <Link href="/" className="inline-flex items-center gap-2 w-fit" aria-label="JobMatch home">
          <Image src="/jobMatchIcon.png" alt="JobMatch" width={40} height={40} className="h-10 w-10 rounded-xl bg-navy p-0.5" />
          <span className="font-semibold text-navy text-lg">JobMatch</span>
        </Link>

        <div className="w-full max-w-md lg:max-w-lg mx-auto my-auto py-8 sm:py-10 space-y-6">
          <div>
            <h1 className="jm-title">Create Your Account</h1>
            <p className="jm-subtitle">
              Sign up now to start posting and managing your jobs with ease.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" encType="multipart/form-data">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="signup-username" className="jm-label">Username</label>
                <input
                  id="signup-username"
                  type="text"
                  placeholder="Enter Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="jm-input"
                />
              </div>
              <div>
                <label htmlFor="signup-fullname" className="jm-label">Full name</label>
                <input
                  id="signup-fullname"
                  type="text"
                  placeholder="Enter Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="jm-input"
                />
              </div>
              <div>
                <label htmlFor="signup-email" className="jm-label">Email</label>
                <input
                  id="signup-email"
                  type="email"
                  placeholder="Enter Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="jm-input"
                />
              </div>
              <div>
                <label htmlFor="signup-confirm-email" className="jm-label">Confirm Email</label>
                <input
                  id="signup-confirm-email"
                  type="email"
                  placeholder="Enter Email"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  className="jm-input"
                />
              </div>
              <div>
                <label htmlFor="signup-phone" className="jm-label">Phone Number</label>
                <input
                  id="signup-phone"
                  type="tel"
                  placeholder="Enter Phone"
                  value={phone}
                  pattern="[0-9]{10}"
                  onChange={(e) => setPhone(e.target.value)}
                  className="jm-input"
                  required
                />
              </div>
              <div>
                <span className="jm-label">Resume</span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="resumeUpload"
                />
                <label
                  htmlFor="resumeUpload"
                  className={`flex items-center justify-center gap-2 min-h-[50px] px-4 py-3 rounded-control border border-dashed cursor-pointer text-sm transition-colors ${
                    resumeFile
                      ? "border-teal bg-teal-50 text-teal-600"
                      : "border-line bg-surface text-ink-600 hover:border-teal hover:bg-teal-50"
                  }`}
                >
                  <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                  </svg>
                  <span className="truncate">{resumeFile ? resumeFile.name : "Upload Files"}</span>
                </label>
              </div>
              <div>
                <label htmlFor="signup-password" className="jm-label">Password</label>
                <input
                  id="signup-password"
                  type="password"
                  placeholder="Enter Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="jm-input"
                />
              </div>
              <div>
                <label htmlFor="signup-confirm-password" className="jm-label">Confirm Password</label>
                <input
                  id="signup-confirm-password"
                  type="password"
                  placeholder="Enter Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="jm-input"
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-2.5 text-sm font-medium text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={recruiter}
                  onChange={() => setRecruiter(!recruiter)}
                  className="h-4 w-4 rounded border-line accent-teal"
                />
                I&apos;m a recruiter
              </label>
              {recruiter && (
                <input
                  type="text"
                  placeholder="Company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="jm-input"
                />
              )}
              <label className="flex items-center gap-2.5 text-sm font-medium text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={() => setAgree(!agree)}
                  className="h-4 w-4 rounded border-line accent-teal"
                />
                <span>
                  I agree to{" "}
                  <Link href="/TermsOfConditions" className="font-medium text-sky hover:text-sky-600 hover:underline">
                    Terms Of Conditions
                  </Link>
                </span>
              </label>
            </div>

            {error && <p className="jm-alert jm-alert-err">{error}</p>}

            <button type="submit" disabled={loading} className="jm-btn jm-btn-primary w-full">
              {loading ? "Submitting..." : "Create Account"}
            </button>

            <p className="text-center text-sm text-ink-600">
              Already Have an Account?{" "}
              <Link href="/Login" className="font-semibold text-sky hover:text-sky-600">
                Sign In
              </Link>
            </p>
          </form>

          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-line" />
            <span className="text-sm text-ink-400">or</span>
            <div className="flex-1 border-t border-line" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <a href="/api/auth/oauth/google?next=/" className="jm-btn jm-btn-secondary w-full">
              <FcGoogle className="h-5 w-5 shrink-0" />
              <span>Continue with Google</span>
            </a>
            <a href="/api/auth/oauth/facebook?next=/" className="jm-btn jm-btn-secondary w-full">
              <FaFacebook className="h-5 w-5 shrink-0 text-sky-600" />
              <span>Continue with Facebook</span>
            </a>
          </div>
        </div>
      </div>

      {/* Image panel (desktop) */}
      <div className="relative hidden lg:block min-h-screen overflow-hidden">
        <Image
          src="/signup_image.png"
          alt="Singup background"
          fill
          sizes="50vw"
          className="object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/50 to-navy/10" />
        <div className="absolute bottom-0 inset-x-0 p-10 xl:p-14 text-white">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky mb-2">JobMatch</p>
          <p className="text-2xl xl:text-3xl font-semibold leading-tight max-w-md">
            Let the right jobs find you.
          </p>
        </div>
      </div>
    </div>
  );
}

export default SignUp;
