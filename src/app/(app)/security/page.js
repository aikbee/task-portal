import { Suspense } from "react";
import SecurityPage from "@/components/modules/SecurityPage";

export const metadata = { title: "Security" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SecurityPage />
    </Suspense>
  );
}
