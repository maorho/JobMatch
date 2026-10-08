import Link from "next/link";
import React from "react";
import { PageHeader } from "../components/ui";

function EmployerDashboard() {
  return (
    <div className="jm-page">
      <PageHeader title="EmployerDashboard" />
      <Link href="./EmployerSettings" className="jm-btn jm-btn-secondary">EmployerSettings</Link>
    </div>
  );
}

export default EmployerDashboard;
