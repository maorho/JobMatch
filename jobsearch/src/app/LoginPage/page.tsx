"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

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
        data.recruiter
          ? router.push("/RecruiterDashboard")
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
    <div className="pt-20 flex min-h-183 p-4 justify-center">
      <div className="w-full max-w-md">
        <h2 className="text-center font-semibold text-2xl text-blue-600 mb-6">
          Great To See You Again!
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-flow-col justify-items-center">
            <input
              type="text"
              className="text-center m-1 w-80 h-10 border border-gray-300 rounded"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="grid grid-flow-col justify-items-center">
            <input
              type="password"
              className="text-center ml-1 mt-1 w-80 h-10 border border-gray-300 rounded"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="grid grid-flow-col justify-items-center">
            <label>
              <Link href="/PasswordReset" className="font-semibold">
                Forgot Password?
              </Link>
            </label>
          </div>

          {error && <p className="text-red-600 mt-2">{error}</p>}
          <div className="grid grid-flow-col justify-items-center">
            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-80 h-10 bg-blue-500 text-white p-1 rounded hover:bg-blue-600"
            >
              {loading ? "Logging in..." : "Submit"}
            </button>
          </div>

          <div className="grid grid-flow-col justify-items-center">
            <label>
              Not signed in?{" "}
              <Link href="/SignUp" className="font-semibold">
                Sign Up
              </Link>
            </label>
          </div>
        </form>
      </div>
    </div>
  );
}

export default LoginForm;
