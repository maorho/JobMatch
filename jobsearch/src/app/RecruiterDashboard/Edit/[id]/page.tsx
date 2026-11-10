"use client";

import { useState } from "react";
import AddNewPositionRecruiter from "../../components/AddNewPositionRecruiter";
import { useParams, useRouter } from "next/navigation";
import { useCurrentUser } from "@/app/lib/hooks/useCurrentUser";
import { useT } from "@/app/lib/i18n/LanguageProvider";

export default function EditJobPage() {
  const { dir } = useT();
  const {user} = useCurrentUser();
  const params = useParams();
  const router = useRouter();
  const jobId = params?.id as string;
  const [, setShowModal] = useState(true);
  const edit = true;
  return (
    <div className="jm-page" dir={dir}>
      <div className="jm-card p-5 sm:p-6 max-w-2xl mx-auto">
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
    </div>
  );
}
