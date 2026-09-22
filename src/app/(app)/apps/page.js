import { Suspense } from "react";
import { redirect } from "next/navigation";
import AppReleasesAdmin from "@/components/modules/AppReleasesAdmin";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Mobile app" };

export default async function Page() {
  const user = await getSessionUser();
  if (user?.role !== "admin") redirect("/");
  return (
    <Suspense fallback={null}>
      <AppReleasesAdmin />
    </Suspense>
  );
}
