import { Suspense } from "react";
import { redirect } from "next/navigation";
import ModerationPage from "@/components/modules/ModerationPage";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Moderation" };

export default async function Page() {
  const user = await getSessionUser();
  if (user?.role !== "admin") redirect("/");
  return (
    <Suspense fallback={null}>
      <ModerationPage />
    </Suspense>
  );
}
