import Link from "next/link";
import React from "react";
import { PageHeader } from "../components/ui";

const EmployerSettings = () => {
  return (
    <div className="jm-page">
      <PageHeader title="EmployerSettings" />
      <Link href="./PasswordReset" className="jm-btn jm-btn-secondary">PasswordReset</Link>
    </div>
  );
};

export default EmployerSettings;
