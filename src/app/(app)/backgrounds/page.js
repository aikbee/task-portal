import { Suspense } from "react";
import { redirect } from "next/navigation";
import BackgroundsAdmin from "@/components/modules/BackgroundsAdmin";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Backgrounds" };

export default async function Page() {
  const user = await getSessionUser();
  if (user?.role !== "admin") redirect("/");
  return (
    <Suspense fallback={null}>
      <BackgroundsAdmin />
    </Suspense>
  );
}
