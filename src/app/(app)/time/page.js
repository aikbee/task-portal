import { Suspense } from "react";
import TimeReport from "@/components/modules/TimeReport";

export const metadata = { title: "Time" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TimeReport />
    </Suspense>
  );
}
