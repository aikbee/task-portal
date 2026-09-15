/** Retention choices shared by the chat and moderation screens (values as strings for <select>/<radio>). */
export const RETENTION_OPTIONS = [
  { value: "", label: "Keep forever" },
  { value: "1", label: "24 hours" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
];
export const retentionLabel = (days, tr) => tr(RETENTION_OPTIONS.find((o) => o.value === String(days ?? ""))?.label ?? "Keep forever");
