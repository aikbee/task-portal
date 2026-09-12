"use client";
import { useState } from "react";
import { Save, Check, Lock } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Toggle } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import { Skeleton } from "@/components/ui/Misc";
import AnimatedBackground from "@/components/shell/AnimatedBackground";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { useUI } from "@/lib/store";
import { MODULE_MAP } from "@/lib/modules";
import { BG_STYLES, normaliseBgSettings } from "@/lib/backgrounds";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/** Admin: which background styles users may choose, the default, and an optional lock. */
export default function BackgroundsAdmin() {
  const tr = useT();
  const mod = MODULE_MAP.backgrounds;
  const { data, loading, error } = useFetch("/api/settings/backgrounds");
  if (error) return <p className="text-sm text-rose-500">{error.message}</p>;
  if (loading || !data) return <Skeleton className="h-96 w-full" />;
  return <Editor key={JSON.stringify(data)} initial={data} mod={mod} tr={tr} />;
}

function Editor({ initial, mod, tr }) {
  const toast = useToast();
  const setBgSettings = useUI((s) => s.setBgSettings);
  const [form, setForm] = useState(() => normaliseBgSettings(initial));
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(normaliseBgSettings(initial));
  const enabled = new Set(form.enabled);

  const toggle = (key, on) => {
    const next = new Set(enabled);
    if (on) next.add(key);
    else next.delete(key);
    if (!next.size) return toast.error(tr("Keep at least one background enabled."));
    const list = BG_STYLES.map((b) => b.value).filter((k) => next.has(k));
    setForm((f) => ({ ...f, enabled: list, default: list.includes(f.default) ? f.default : list[0] }));
  };
  const setDefault = (key) => setForm((f) => ({ ...f, default: key, enabled: f.enabled.includes(key) ? f.enabled : [...f.enabled, key] }));
  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.put("/api/settings/backgrounds", form);
      setBgSettings(saved);
      toast.success(tr("Background settings saved"));
    } catch (e) {
      toast.error("Could not save", e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title={tr("Backgrounds")} description={tr(mod.description)} icon={mod.icon} color={mod.color} crumbs={[]} actions={<Button icon={Save} onClick={save} loading={saving} disabled={!dirty}>{tr("Save changes")}</Button>} />
      <Card className="mb-4 space-y-3">
        <Toggle checked={form.locked} onChange={(v) => setForm((f) => ({ ...f, locked: v }))} label={tr("Lock the background for everyone")} description={tr("Users see the default below and cannot choose their own")} />
        <p className="text-xs text-fg-muted">{tr("{n} of {total} styles enabled · default: {d}", { n: form.enabled.length, total: BG_STYLES.length, d: tr(BG_STYLES.find((b) => b.value === form.default)?.label ?? form.default) })}</p>
      </Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 anim-stagger">
        {BG_STYLES.map((b) => {
          const on = enabled.has(b.value);
          const isDefault = form.default === b.value;
          return (
            <Card key={b.value} padding={false} className={cn("overflow-hidden", !on && "opacity-60")}>
              <div className="bg-preview aspect-[16/9] bg-bg" data-theme={undefined}>
                <AnimatedBackground preview={b.value} />
                {isDefault ? <span className="absolute left-2 top-2 z-10 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-white">{tr("Default")}</span> : null}
                {form.locked && isDefault ? <span className="absolute right-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-full bg-surface/90 text-accent"><Lock size={12} /></span> : null}
              </div>
              <div className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{tr(b.label)}</p>
                  <p className="text-[11px] text-fg-muted">{tr(b.desc)}</p>
                  <button type="button" onClick={() => setDefault(b.value)} className={cn("mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]", isDefault ? "border-accent bg-accent/10 text-accent" : "border-line text-fg-muted hover:text-fg")}>
                    {isDefault ? <Check size={11} /> : null} {isDefault ? tr("Default") : tr("Make default")}
                  </button>
                </div>
                <Toggle checked={on} onChange={(v) => toggle(b.value, v)} label="" aria-label={tr(b.label)} />
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
