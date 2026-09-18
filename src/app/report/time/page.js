import { Suspense } from "react";
import TimeSheetReport from "@/components/report/TimeSheetReport";

export const metadata = { title: "Time report" };

/** Print-ready time report: /report/time?from=&to=&group=&project_id=&user_id= (same filters as the Time page). */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <TimeSheetReport />
    </Suspense>
  );
}
