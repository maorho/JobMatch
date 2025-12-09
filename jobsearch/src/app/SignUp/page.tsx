"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FcGoogle } from "react-icons/fc";
import { FaFacebook } from "react-icons/fa";

const SignUpImage = () => (
  <Image
    src="/signup_image.png"
    alt="Singup background"
    width={780}
    height={1500}
    className="rounded-t-[60px] w-full lg:rounded-tr-none  lg:rounded-l-[60px] lg:h-screen h-auto"
    priority
  />
);
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
  const [admin, setAdmin] = useState(false);
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
            : "/Dashboard"
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
    <div className="flex flex-col lg:flex-row h-full font-outfit">
      <div className="px-10 lg:my-auto lg:w-1/2 pt-10 lg:justify-items-center">
        <div className="mb-7 w-fit lg:w-full lg:justify-items-center">
          <h2 className="font-outfit font-medium text-[28px] lg:text-[40px]">
            Create Your Account
          </h2>
          <p className="font-outfit font-medium text-[#232323]/40 text-[14px]  lg:text-[16px]">
            Sign up now to start posting and managing your jobs with ease.
          </p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="space-y-3 lg:w-4/5"
          encType="multipart/form-data"
        >
          <div className="lg:grid lg:grid-cols-2 gap-5 gap-y-[14px]">
            <div className="flex flex-col">
              <label className="text-[18px] font-medium text-[#222222] font-outfit">
                Username
              </label>
              <input
                type="text"
                placeholder="Enter Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-10 border-[0.5px] p-5 rounded-[8px] lg:rounded-[14px] border-[#22222280]/50"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[18px] font-medium text-[#222222] font-outfit">
                Full name
              </label>
              <input
                type="text"
                placeholder="Enter Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="h-10 border-[0.5px] p-5 rounded-[8px] lg:rounded-[14px] border-[#22222280]/50"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[18px] font-medium text-[#222222] font-outfit">
                Email
              </label>
              <input
                type="email"
                placeholder="Enter Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 border-[0.5px] p-5 rounded-[8px] lg:rounded-[14px] border-[#22222280]/50"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[18px] font-medium text-[#222222] font-outfit">
                Confirm Email
              </label>
              <input
                type="email"
                placeholder="Enter Email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                className="h-10 border-[0.5px] p-5 rounded-[8px] lg:rounded-[14px] border-[#22222280]/50"
              />
            </div>
          </div>

          <div className="flex flex-col">
            <label className="text-[18px] font-medium text-[#222222] font-outfit">
              Phone Number
            </label>
            <input
              type="tel"
              placeholder="Enter Phone"
              value={phone}
              pattern="[0-9]{10}"
              onChange={(e) => setPhone(e.target.value)}
              className="h-10 border-[0.5px] p-5 rounded-[8px] lg:rounded-[14px] border-[#22222280]/50"
              required
            />
          </div>
          <div className="flex flex-col">
            <label className="block">
              <span className="text-[18px] font-medium text-[#222222] font-outfit">
                Resume
              </span>
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                className="hidden"
                id="resumeUpload"
              />
              <label
                htmlFor="resumeUpload"
                className="mt-2 flex items-center justify-center cursor-pointer h-10 border border-[#22222280]/50 rounded-[8px] lg:rounded-[14px] px-4 hover:bg-gray-50 transition"
              >
                {resumeFile ? resumeFile.name : "Upload Files"}
              </label>
            </label>
          </div>
          <div className="flex flex-col">
            <label className="text-[18px] font-medium text-[#222222] font-outfit">
              Password
            </label>
            <input
              type="password"
              placeholder="Enter Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 border-[0.5px] p-5 rounded-[8px] lg:rounded-[14px] border-[#22222280]/50"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[18px] font-medium text-[#222222] font-outfit">
              Confirm Password
            </label>
            <input
              type="password"
              placeholder="Enter Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="h-10 border-[0.5px] p-5 rounded-[8px] lg:rounded-[14px] border-[#22222280]/50"
            />
          </div>
          <div className="grid grid-flow-col">
            <div className="flex gap-2">
              <input
                type="checkbox"
                checked={recruiter}
                onChange={() => setRecruiter(!recruiter)}
              />
              <label className="text-sm font-medium">I&apos;m a recruiter</label>
            </div>
            <div className="flex gap-2">
              <input
                type="checkbox"
                checked={admin}
                onChange={() => setAdmin(!admin)}
              />
              <label className="text-sm font-medium">I&apos;m an Admin</label>
            </div>
          </div>
          <div className="grid grid-flow-col">
            {(recruiter || admin) && (
              <input
                type="text"
                placeholder="Company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="h-10 border-[0.5px] p-5 rounded-[8px] lg:rounded-[14px] border-[#22222280]/50"
              />
            )}
          </div>
          <div className="grid grid-flow-col">
            <div className="flex gap-2">
              <input
                type="checkbox"
                checked={agree}
                onChange={() => setAgree(!agree)}
              />
              <label className="text-sm font-medium">
                I agree to{" "}
                <Link
                  href="/TermsOfConditions"
                  className="font-medium text-[#0C82EE] hover:underline"
                >
                  Terms Of Conditions
                </Link>
              </label>
            </div>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex flex-col justify-items-center">
            <button
              type="submit"
              disabled={loading}
              className={`w-full text-white text-[18px] py-4 rounded-[14px] ${
                loading
                  ? "bg-blue-300 cursor-not-allowed"
                  : "bg-[#24A8A2] hover:bg-blue-600"
              }`}
            >
              {loading ? "Submitting..." : "Create Account"}
            </button>
            <div className="text-center mt-5 mb-1">
              <p className="font-outfit text-[#22222299]/60 font-normal">
                Already Have an Account?  
                <Link
                  href="/Login"
                  className="text-[15px] font-medium lg:text-[18px] text-[#11AEFF]"
                >
                  Sign In
                </Link>
              </p>
            </div>
            <div className="w-full mx-auto mt-12 mb-5">
              {/* קו אופקי עם "OR" באמצע */}
              <div className="flex w-full items-center gap-2 mb-5 ">
                <div className="flex-1 border-t border-[#66666640]" />
                <span className="font-outfit text-[18px] text-[#66666680]">
                  OR
                </span>
                <div className="flex-1 border-t border-[#66666640]" />
              </div>

              {/* כפתורי ההרשמה */}
              <div className="w-full max-w-[520px] mx-auto p-4 flex flex-col sm:flex-row gap-4 justify-center items-center">
                {/* Google */}
                <button
                  className="font-outfit font-normal border border-[#23232380]/50 rounded-[40px]
                flex items-center justify-center gap-2 sm:gap-3
                py-2.5 px-4 sm:py-3 sm:px-6 md:py-3 md:px-7 lg:py-3 lg:px-7 xl:py-3.5 xl:px-9
                text-[13px] sm:text-[14px] md:text-[15px] lg:text-[15px] xl:text-[16px]
                whitespace-nowrap w-full sm:w-[48%] max-w-full
                hover:bg-gray-50 transition-all duration-200 overflow-hidden"
                >
                  <FcGoogle className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" />
                  <span className="leading-none">Sign up with Google</span>
                </button>

                {/* Facebook */}
                <button
                  className="font-outfit font-normal border border-[#23232380]/50 rounded-[40px]
                flex items-center justify-center gap-2 sm:gap-3
                py-2.5 px-4 sm:py-3 sm:px-6 md:py-3 md:px-7 lg:py-3 lg:px-7 xl:py-3.5 xl:px-9
                text-[13px] sm:text-[14px] md:text-[15px] lg:text-[15px] xl:text-[16px]
                whitespace-nowrap w-full sm:w-[48%] max-w-full
                hover:bg-gray-50 transition-all duration-200 overflow-hidden"
                >
                  <FaFacebook className="text-[#1877F2] w-6 h-5 sm:w-6 sm:h-6 flex-shrink-0" />
                  <span className="leading-none">Sign up with Facebook</span>
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
      <div className="lg:w-1/2">
        <SignUpImage />
      </div>
    </div>
  );
}

export default SignUp;