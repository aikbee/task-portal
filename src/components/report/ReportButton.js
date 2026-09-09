"use client";
import { FileText } from "lucide-react";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";

/** Opens the print-ready report in a new tab. */
export default function ReportButton({ module, id, size }) {
  const tr = useT();
  const href = id != null ? `/report/${module}/${id}` : `/report/${module}`;
  return (
    <a href={href} target="_blank" rel="noreferrer">
      <Button variant="outline" size={size} icon={FileText}>{tr("Report")}</Button>
    </a>
  );
}
