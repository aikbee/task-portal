import { Suspense } from "react";
import JoinView from "@/components/auth/JoinView";

export const metadata = { title: "Invitation" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <JoinView />
    </Suspense>
  );
}
