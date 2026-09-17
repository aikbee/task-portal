import { Suspense } from "react";
import { redirect } from "next/navigation";
import BackupsAdmin from "@/components/modules/BackupsAdmin";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Backups" };

export default async function Page() {
  const user = await getSessionUser();
  if (user?.role !== "admin") redirect("/");
  return (
    <Suspense fallback={null}>
      <BackupsAdmin />
    </Suspense>
  );
}
