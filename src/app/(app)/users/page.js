import { Suspense } from "react";
import { redirect } from "next/navigation";
import UsersList from "@/components/modules/UsersList";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Users" };

export default async function Page() {
  const user = await getSessionUser();
  if (user?.role !== "admin") redirect("/");
  return (
    <Suspense fallback={null}>
      <UsersList />
    </Suspense>
  );
}
