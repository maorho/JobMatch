"use client";

import AddNewPositionRecruiter from "../../components/AddNewPositionRecruiter";
import { useParams, useRouter } from "next/navigation";

export default function EditJobPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params?.id as string;

  return (
    <AddNewPositionRecruiter
      jobId={jobId}
      onSuccess={() => {
        router.push("/RecruiterDashboard");
      }}
    />
  );
}
