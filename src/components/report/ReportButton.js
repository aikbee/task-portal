"use client";
import { FileText } from "lucide-react";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";
import { useFeature } from "@/lib/auth-context";

/** Opens the print-ready report in a new tab. */
export default function ReportButton({ module, id, size }) {
  const tr = useT();
  const allowed = useFeature("export");
  const href = id != null ? `/report/${module}/${id}` : `/report/${module}`;
  if (!allowed) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer">
      <Button variant="outline" size={size} icon={FileText}>{tr("Report")}</Button>
    </a>
  );
}
