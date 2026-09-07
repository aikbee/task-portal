import { Suspense } from "react";
import ProfilesList from "@/components/modules/ProfilesList";

export const metadata = { title: "Profiles" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ProfilesList />
    </Suspense>
  );
}
