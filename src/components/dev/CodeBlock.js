"use client";
import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** A code sample with a copy button (the API guide). */
export function CodeBlock({ code, label, className }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <div className={cn("dev-code group relative overflow-hidden rounded-app border border-line bg-surface-2", className)}>
      {label ? <div className="border-b border-line px-3 py-1.5 text-[11px] font-medium text-fg-muted">{label}</div> : null}
      <button type="button" onClick={copy} className="absolute right-2 top-1.5 inline-flex items-center gap-1 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] text-fg-muted opacity-80 transition hover:text-fg group-hover:opacity-100" aria-label="Copy">
        {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
      </button>
      <pre className="overflow-x-auto p-3 pr-16 font-mono text-[12.5px] leading-relaxed"><code>{code}</code></pre>
    </div>
  );
}

/** The same sample in several languages, one at a time. */
export function CodeTabs({ samples }) {
  const [active, setActive] = useState(0);
  return (
    <div className="dev-code-tabs">
      <div className="flex gap-1" role="tablist">
        {samples.map((s, i) => (
          <button key={s.label} type="button" role="tab" aria-selected={i === active} onClick={() => setActive(i)} className={cn("rounded-t-md border border-b-0 px-3 py-1 text-xs font-medium transition", i === active ? "border-line bg-surface-2 text-fg" : "border-transparent text-fg-muted hover:text-fg")}>
            {s.label}
          </button>
        ))}
      </div>
      <CodeBlock code={samples[active].code} className="rounded-tl-none" />
    </div>
  );
}
