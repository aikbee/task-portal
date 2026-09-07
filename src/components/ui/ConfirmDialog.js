"use client";
import { AlertTriangle } from "lucide-react";
import Modal from "./Modal";
import Button from "./Button";
import { useT } from "@/lib/i18n";

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "Are you sure?",
  description,
  confirmText = "Delete",
  cancelText = "Cancel",
  danger = true,
  loading = false,
}) {
  const tr = useT();
  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="flex gap-4">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${danger ? "bg-rose-500/12 text-rose-500" : "bg-accent/12 text-accent"}`}>
          <AlertTriangle size={20} />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{tr(title)}</h3>
          {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          {tr(cancelText)}
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
          {tr(confirmText)}
        </Button>
      </div>
    </Modal>
  );
}
