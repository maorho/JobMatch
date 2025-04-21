import Link from "next/link";
import React from "react";

function PasswordReset() {
  return (
    <div className="ml-3 h-100 p-2 items-center">
      <h2 className="text-center w-1/2 mt-20 pl-10 m-auto font-semibold text-2xl text-blue-600">
        Password Reset
      </h2>

      <form>
        <div className="items-center mx-100">
          <input
            type="email"
            className="text-center ml-1 mt-1 w-80 h-10 border border-gray-300 rounded"
            placeholder="Email"
          />
        </div>
        <button
          type="submit"
          className="items-center mx-101 mt-8 w-80 h-10 bg-blue-500 text-white p-1 rounded hover:bg-blue-600"
        >
          Reset
        </button>
      </form>
    </div>
  );
}

export default PasswordReset;
