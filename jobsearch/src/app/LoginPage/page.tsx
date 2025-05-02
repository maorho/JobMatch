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
        body: JSON.stringify({ email: username, password }), // משתמש בשם המשתמש כשם אימייל לצורך בדיקות
      });

      const data = await res.json();

      if (res.ok) {
        router.push("/Dashboard");
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
    <div className="ml-3 pt-20 h-110 items-center">
      <h2 className="text-center w-1/2 pl-7 pb-5 ml-70 font-semibold text-2xl text-blue-600">
        Great To See You Again!
      </h2>
      <form onSubmit={handleSubmit} className="ml-10">
        <div className="items-center mx-100">
          <input
            type="text"
            className="text-center m-1  w-80 h-10 border border-gray-300 rounded"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="items-center mx-100">
          <input
            type="password"
            className="text-center ml-1 mt-1 w-80 h-10 border border-gray-300 rounded"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="items-center mx-100">
          <label className="ml-25">
            <Link href="/PasswordReset" className="font-semibold">
              Forgot Password?
            </Link>
          </label>
        </div>

        {error && <p className="text-red-600 mt-2">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="items-center mx-101 mt-6 w-80 h-10 bg-blue-500 text-white p-1 rounded hover:bg-blue-600"
        >
          {loading ? "Logging in..." : "Submit"}
        </button>

        <div className="items-center mx-100">
          <label className="ml-20">
            Not signed in?{" "}
            <Link href="/SignUp" className="font-semibold">
              Sign Up
            </Link>
          </label>
        </div>
      </form>
    </div>
  );
}

export default LoginForm;
