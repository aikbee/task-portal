import { redirect } from "next/navigation";
import EmbedShell from "@/components/shell/EmbedShell";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Pane" };

/** Bare shell used by split-view panes (iframes): no sidebar / bars / background. */
export default async function EmbedLayout({ children }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { session_id, expires_at, ...safe } = user;
  return <EmbedShell user={safe}>{children}</EmbedShell>;
}
