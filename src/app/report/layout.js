import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AuthProvider } from "@/lib/auth-context";

/** Print-ready reports: no app chrome, always the light theme, session still required. */
export default async function ReportLayout({ children }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { session_id, expires_at, ...safe } = user;
  return (
    <AuthProvider user={safe}>
      <div data-theme="light" className="report-root h-dvh overflow-y-auto bg-[#eef0f6] text-fg print:h-auto print:overflow-visible print:bg-white">
        {children}
      </div>
    </AuthProvider>
  );
}
