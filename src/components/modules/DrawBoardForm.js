"use client";
import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Input, Textarea, Select, Field } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { useT } from "@/lib/i18n";

export const SIZE_PRESETS = [
  { label: "1280 × 800 (default)", w: 1280, h: 800 },
  { label: "1600 × 1000", w: 1600, h: 1000 },
  { label: "1920 × 1080 (16:9)", w: 1920, h: 1080 },
  { label: "1080 × 1080 (square)", w: 1080, h: 1080 },
  { label: "1123 × 794 (A4 landscape)", w: 1123, h: 794 },
  { label: "794 × 1123 (A4 portrait)", w: 794, h: 1123 },
];

const empty = { title: "", description: "", project_id: "", width: 1280, height: 800, background: "#ffffff" };
const fromInitial = (i) => (i ? { title: i.title ?? "", description: i.description ?? "", project_id: i.project_id ?? "", width: i.width ?? 1280, height: i.height ?? 800, background: i.background ?? "#ffffff" } : { ...empty });

export default function DrawBoardForm({ open, onClose, initial = null, onSaved }) {
  if (!open) return null;
  return <Inner key={initial?.id ?? "new"} onClose={onClose} initial={initial} onSaved={onSaved} />;
}

function Inner({ onClose, initial, onSaved }) {
  const tr = useT();
  const [form, setForm] = useState(() => fromInitial(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();
  const { data: projects } = useFetch("/api/projects");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const preset = SIZE_PRESETS.findIndex((p) => p.w === Number(form.width) && p.h === Number(form.height));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { title: form.title, description: form.description, project_id: form.project_id || null, width: Number(form.width), height: Number(form.height), background: form.background };
      const saved = initial ? await api.put(`/api/drawboards/${initial.id}?light=1`, payload) : await api.post("/api/drawboards", payload);
      toast.success(initial ? tr("Board updated") : tr("Board created"), saved.title);
      onSaved?.(saved, !initial);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={initial ? tr("Edit board") : tr("New board")} size="md"
      footer={<><Button variant="secondary" onClick={onClose} disabled={saving}>{tr("Cancel")}</Button><Button onClick={submit} loading={saving}>{initial ? tr("Save changes") : tr("Create board")}</Button></>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={tr("Title")} required><Input autoFocus value={form.title} onChange={(e) => set("title", e.target.value)} placeholder={tr("Whiteboard for the sprint review")} required /></Field>
        <Field label={tr("Description")}><Textarea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} /></Field>
        <Field label={tr("Project")}>
          <Select value={form.project_id} onChange={(e) => set("project_id", e.target.value)}><option value="">{tr("None")}</option>{(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={tr("Canvas size")}>
            <Select value={preset} onChange={(e) => { const p = SIZE_PRESETS[Number(e.target.value)]; if (p) { set("width", p.w); set("height", p.h); } }}>
              {preset === -1 ? <option value={-1}>{form.width} × {form.height}</option> : null}
              {SIZE_PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
            </Select>
          </Field>
          <Field label={tr("Background")}>
            <div className="flex items-center gap-2">
              <input type="color" value={form.background} onChange={(e) => set("background", e.target.value)} className="h-9 w-12 cursor-pointer rounded-app-sm border border-line bg-transparent p-0.5" aria-label={tr("Background")} />
              <Input value={form.background} onChange={(e) => set("background", e.target.value)} className="font-mono" />
            </div>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label={tr("Width")}><Input type="number" min={200} max={6000} value={form.width} onChange={(e) => set("width", e.target.value)} /></Field>
          <Field label={tr("Height")}><Input type="number" min={200} max={6000} value={form.height} onChange={(e) => set("height", e.target.value)} /></Field>
        </div>
        {initial ? <p className="text-[11px] text-fg-muted">{tr("Changing the size keeps the drawing; objects outside the new area are simply hidden until moved back.")}</p> : null}
        {error ? <p className="text-sm text-rose-500">{error}</p> : null}
      </form>
    </Modal>
  );
}
