import Link from "next/link";
import React from "react";

interface EmployerProps {
  username: string;
  email: string;
}

const EmployerSettings: React.FC<EmployerProps> = ({ username, email }) => {
  return (
    <div>
      <h2>EmployerSettings</h2>
      <Link href="./PasswordReset">PasswordReset</Link>
    </div>
  );
};

export default EmployerSettings;
