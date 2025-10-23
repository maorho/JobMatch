"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FcGoogle } from "react-icons/fc";
import { FaFacebook } from "react-icons/fa";

function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: username, password }),
      });

      const data = await res.json();

      if (res.ok) {
        data.recruiter ? router.push("/RecruiterDashboard") : router.push("/");
      } else {
        setError(data.message || "Login failed");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }
  const LoginImage = () => (
    <Image
      src="/login_image.jpg"
      alt="Singin background"
      width={780}
      height={1024}
      className="rounded-t-[60px] w-full lg:rounded-tr-none  lg:rounded-l-[60px] lg:h-screen h-auto"
      priority
    />
  );
  return (
    <div className="flex flex-col lg:flex-row h-full font-outfit">
      <div className="px-10 lg:my-auto lg:w-1/2">
        <div className="mx-auto pt-10 lg:w-[90%]">
          <div>
            <h2 className="text-[28px] lg:text-4xl font-medium mb-4">
              Welcome Back
            </h2>
            <span className="text-[16px] text-[#222222] font-outfit">
              Sign in to access your account.
            </span>
          </div>
          <div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="mt-10">
                <h3 className="font-semibold font-outfit mb-3">Username</h3>
                <input
                  type="text"
                  className="px-5 w-full h-10 border text-[#222222] border-gray-300 rounded-[14px] text-[16px]"
                  placeholder="Enter Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div>
                <h3 className="font-semibold font-outfit mb-3 mt-5 ">
                  Password
                </h3>
                <input
                  type="password"
                  className="px-5 w-full h-10 border text-[#222222] border-gray-300 rounded-[14px] text-[16px]"
                  placeholder="Enter Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="text-[#FF0000] text-[16px] mt-8">
                <label>
                  <Link href="/PasswordReset" className="font-semibold">
                    Forgot Password?
                  </Link>
                </label>
              </div>

              {error && <p className="text-red-600 mt-2">{error}</p>}
              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 w-full bg-[#24A8A2] text-white py-3.5 px-10 rounded-[14px] hover:bg-blue-600"
                >
                  {loading ? "Logging in..." : "Sign In"}
                </button>
              </div>

              <div className="grid grid-flow-col justify-items-center">
                <label>
                  Not signed in?{" "}
                  <Link href="/SignUp" className="font-semibold text-[#11AEFF]">
                    Sign Up
                  </Link>
                </label>
              </div>
            </form>
          </div>
          <div className="w-full mx-auto mt-12 mb-5">
            {/* קו אופקי עם "OR" באמצע */}
            <div className="flex w-full items-center gap-2 mb-8 ">
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
                <FaFacebook className="text-[#1877F2] w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" />
                <span className="leading-none">Sign up with Facebook</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="lg:w-1/2">
        <LoginImage />
      </div>
    </div>
  );
}

export default LoginForm;
