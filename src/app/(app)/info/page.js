import { Suspense } from "react";
import InfoList from "@/components/modules/InfoList";

export const metadata = { title: "Info" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <InfoList />
    </Suspense>
  );
}
