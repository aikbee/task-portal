import { Suspense } from "react";
import InfoSearch from "@/components/modules/InfoSearch";

export const metadata = { title: "Search info" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <InfoSearch />
    </Suspense>
  );
}
