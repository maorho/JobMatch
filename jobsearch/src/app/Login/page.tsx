"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Messages for the social-login callback's ?error= codes.
const OAUTH_ERRORS: Record<string, string> = {
  oauth_denied: "ההתחברות בוטלה.",
  oauth_state: "ההתחברות פגה או לא תקינה — נסה שוב.",
  oauth_email_unverified: "הספק לא אימת את כתובת המייל — התחבר עם ספק אחר או עם סיסמה.",
  oauth_not_configured: "התחברות חברתית עדיין לא מוגדרת בסביבה הזו.",
  oauth_failed: "ההתחברות נכשלה — נסה שוב.",
};
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

  // Surface a social-login failure (callback redirects here with ?error=).
  // Read from window instead of useSearchParams to keep this page static.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code) setError(OAUTH_ERRORS[code] || OAUTH_ERRORS.oauth_failed);
  }, []);

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
      console.log(`data:`,data);
      console.log(`is admin:`,data.admin);
      if (res.ok) {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        data.recruiter
          ? router.push("/RecruiterDashboard")
          : data.admin
          ? router.push("/AdminDashboard")
          : router.push("/Dashboard");
      } else {
        setError(data.message || "Login failed");
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
          src="/login_image.jpg"
          alt="Singin background"
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/60 to-navy/20" />
        <p className="absolute bottom-4 inset-x-4 sm:inset-x-6 text-white text-sm sm:text-base font-medium">
          Your next role, matched to you.
        </p>
      </div>

      {/* Form column */}
      <div className="flex flex-col px-4 sm:px-6 lg:px-12 py-6 sm:py-8 lg:py-10">
        <Link href="/" className="inline-flex items-center gap-2 w-fit" aria-label="JobMatch home">
          <Image src="/jobMatchIcon.png" alt="JobMatch" width={40} height={40} className="h-10 w-10 rounded-xl bg-navy p-0.5" />
          <span className="font-semibold text-navy text-lg">JobMatch</span>
        </Link>

        <div className="w-full max-w-md mx-auto my-auto py-8 sm:py-10 space-y-6">
          <div>
            <h1 className="jm-title">Welcome Back</h1>
            <p className="jm-subtitle">Sign in to access your account.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-username" className="jm-label">Username</label>
              <input
                id="login-username"
                type="text"
                className="jm-input"
                placeholder="Enter Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <label htmlFor="login-password" className="jm-label mb-0">Password</label>
                <Link href="/PasswordReset" className="text-sm font-medium text-sky hover:text-sky-600">
                  Forgot Password?
                </Link>
              </div>
              <input
                id="login-password"
                type="password"
                className="jm-input"
                placeholder="Enter Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <p className="jm-alert jm-alert-err">{error}</p>}

            <button type="submit" disabled={loading} className="jm-btn jm-btn-primary w-full">
              {loading ? "Logging in..." : "Sign In"}
            </button>

            <p className="text-center text-sm text-ink-600">
              Not signed in?{" "}
              <Link href="/SignUp" className="font-semibold text-sky hover:text-sky-600">
                Sign Up
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
          src="/login_image.jpg"
          alt="Singin background"
          fill
          sizes="50vw"
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/50 to-navy/10" />
        <div className="absolute bottom-0 inset-x-0 p-10 xl:p-14 text-white">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky mb-2">JobMatch</p>
          <p className="text-2xl xl:text-3xl font-semibold leading-tight max-w-md">
            Your next role, matched to you.
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginForm;
