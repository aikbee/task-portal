import { Suspense } from "react";
import TimelineView from "@/components/modules/TimelineView";

export const metadata = { title: "Timeline" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TimelineView />
    </Suspense>
  );
}
