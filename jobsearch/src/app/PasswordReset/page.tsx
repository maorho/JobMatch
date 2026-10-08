"use client";
import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";

function PasswordReset() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    // Prevent the default GET navigation that would leak the email into the URL.
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-2">
      {/* Mobile banner (image panel is full-height on lg) */}
      <div className="relative h-36 sm:h-44 lg:hidden overflow-hidden">
        <Image
          src="/login_image.jpg"
          alt="Password reset background"
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/60 to-navy/20" />
        <p className="absolute bottom-4 inset-x-4 sm:inset-x-6 text-white text-sm sm:text-base font-medium">
          Get back to your next opportunity.
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
            <h1 className="jm-title">Password Reset</h1>
            <p className="jm-subtitle">Enter your email and we&apos;ll send you reset instructions.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="reset-email" className="jm-label">Email</label>
              <input
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="jm-input"
                placeholder="Email"
              />
            </div>
            <button type="submit" className="jm-btn jm-btn-primary w-full">
              Reset
            </button>
          </form>

          {submitted && (
            <p className="jm-alert jm-alert-info">
              If an account exists for that email, you&apos;ll receive reset
              instructions. (Email-based reset is coming soon.)
            </p>
          )}

          <p className="text-center text-sm text-ink-600">
            Remembered it?{" "}
            <Link href="/Login" className="font-semibold text-sky hover:text-sky-600">
              Back to Sign In
            </Link>
          </p>
        </div>
      </div>

      {/* Image panel (desktop) */}
      <div className="relative hidden lg:block min-h-screen overflow-hidden">
        <Image
          src="/login_image.jpg"
          alt="Password reset background"
          fill
          sizes="50vw"
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/50 to-navy/10" />
        <div className="absolute bottom-0 inset-x-0 p-10 xl:p-14 text-white">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky mb-2">JobMatch</p>
          <p className="text-2xl xl:text-3xl font-semibold leading-tight max-w-md">
            Get back to your next opportunity.
          </p>
        </div>
      </div>
    </div>
  );
}

export default PasswordReset;
