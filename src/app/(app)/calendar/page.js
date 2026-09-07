import { Suspense } from "react";
import CalendarView from "@/components/modules/CalendarView";

export const metadata = { title: "Calendar" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CalendarView />
    </Suspense>
  );
}
