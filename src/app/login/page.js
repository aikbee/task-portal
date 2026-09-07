import { Suspense } from "react";
import LoginView from "@/components/auth/LoginView";

export const metadata = { title: "Sign in" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LoginView demo={process.env.NODE_ENV !== "production"} />
    </Suspense>
  );
}
