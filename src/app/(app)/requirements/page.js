import { Suspense } from "react";
import RequirementsList from "@/components/modules/RequirementsList";

export const metadata = { title: "Requirements" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RequirementsList />
    </Suspense>
  );
}
