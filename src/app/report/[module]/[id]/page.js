import { notFound } from "next/navigation";
import RecordReport from "@/components/report/RecordReport";
import { REPORT_MODULES } from "@/lib/report-modules";

export const metadata = { title: "Report" };

export default async function Page({ params }) {
  const { module, id } = await params;
  if (!REPORT_MODULES.includes(module) || !/^\d+$/.test(id)) notFound();
  return <RecordReport module={module} id={Number(id)} />;
}
