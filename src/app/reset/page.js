import { Suspense } from "react";
import ResetView from "@/components/auth/ResetView";

export const metadata = { title: "New password" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ResetView />
    </Suspense>
  );
}
