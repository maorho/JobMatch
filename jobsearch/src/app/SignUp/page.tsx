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
        }), // אפשר להוסיף גם fullName ו־username לפי הצורך
      });

      const data = await res.json();

      if (res.ok) {
        router.push("/Dashboard");
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
    <div className="ml-3 p-2 items-center">
      <h2 className="text-center w-1/2 pl-10 m-auto font-semibold text-2xl text-blue-600">
        Want to accelerate your job search?
      </h2>
      <h2 className="text-center w-1/2 pl-10 m-auto font-semibold text-2xl text-blue-600">
        Sign Up Now
      </h2>

      <form onSubmit={handleSubmit}>
        <div className="items-center mx-100">
          <input
            type="text"
            className="text-center m-1 w-80 h-10 border border-gray-300 rounded"
            placeholder="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div className="items-center mx-100">
          <input
            type="text"
            className="text-center m-1 w-80 h-10 border border-gray-300 rounded"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="items-center mx-100">
          <input
            type="email"
            className="text-center ml-1 mt-1 w-80 h-10 border border-gray-300 rounded"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="items-center mx-100">
          <input
            type="email"
            className="text-center ml-1 mt-1 w-80 h-10 border border-gray-300 rounded"
            placeholder="Confirm Email"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
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
          <input
            type="password"
            className="text-center ml-1 mt-1 w-80 h-10 border border-gray-300 rounded"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        <div className="items-center mx-100">
          <input
            type="checkbox"
            checked={agree}
            onChange={() => setAgree(!agree)}
          />
          <label className="ml-1">
            I agree to{" "}
            <Link href="./TermsOfConditions" className="font-semibold">
              Terms Of Conditions
            </Link>
          </label>
        </div>

        {error && <p className="text-red-600 mt-2">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="items-center mx-100 w-80 h-10 bg-blue-500 text-white p-1 rounded hover:bg-blue-600 mt-2"
        >
          {loading ? "Submitting..." : "Submit"}
        </button>
      </form>
    </div>
  );
}

export default SignUp;
