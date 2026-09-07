import { redirect } from "next/navigation";
import AppShell from "@/components/shell/AppShell";
import { getSessionUser } from "@/lib/auth";

/** Every normal page renders inside the full chrome; the session is resolved here and passed down. */
export default async function AppLayout({ children }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { session_id, expires_at, ...safe } = user;
  return <AppShell user={safe}>{children}</AppShell>;
}
