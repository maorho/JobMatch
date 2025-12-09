"use client";

import { useState } from "react";
import AddNewPositionRecruiter from "../../components/AddNewPositionRecruiter";
import { useParams, useRouter } from "next/navigation";
import { useCurrentUser } from "@/app/lib/hooks/useCurrentUser";

export default function EditJobPage() {
  const {user} = useCurrentUser();
  const params = useParams();
  const router = useRouter();
  const jobId = params?.id as string;
  const [showModal, setShowModal] = useState(true);
  const edit = true;
  return (
    <div className="max-w-[500px]  mx-auto mt-5">
      <AddNewPositionRecruiter
        jobId={jobId}
        onSuccess={() => {
          if (user?.admin) {
            router.push("/AdminDashboard");
          } else {
            router.push("/RecruiterDashboard");
          }
        }}
        setShowModal={setShowModal}
        edit={edit}
      />
    </div>
  );
}