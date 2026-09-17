import { Suspense } from "react";
import { redirect } from "next/navigation";
import MailAdmin from "@/components/modules/MailAdmin";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Email" };

export default async function Page() {
  const user = await getSessionUser();
  if (user?.role !== "admin") redirect("/");
  return (
    <Suspense fallback={null}>
      <MailAdmin />
    </Suspense>
  );
}
