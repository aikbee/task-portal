import { notFound } from "next/navigation";
import ModuleReport from "@/components/report/ModuleReport";
import { REPORT_MODULES } from "@/lib/report-modules";

export const metadata = { title: "Report" };

export default async function Page({ params }) {
  const { module } = await params;
  if (!REPORT_MODULES.includes(module)) notFound();
  return <ModuleReport module={module} />;
}
