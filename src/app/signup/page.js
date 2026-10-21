import { Suspense } from "react";
import SignupView from "@/components/auth/SignupView";

export const metadata = { title: "Create an account" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SignupView />
    </Suspense>
  );
}
