import { Suspense } from "react";
import ForgotView from "@/components/auth/ForgotView";

export const metadata = { title: "Forgot password" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ForgotView />
    </Suspense>
  );
}
