"use client";
import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Input, Textarea, Select, Field } from "@/components/ui/Controls";
import MultiSelect from "@/components/ui/MultiSelect";
import ColorPicker from "@/components/ui/ColorPicker";
import Avatar from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { PROJECT_STATUS } from "@/lib/modules";
import { fullName, toCode } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const empty = { name: "", code: "", description: "", status: "planning", color: "#6366f1", start_date: "", end_date: "", budget: "", employee_ids: [] };

function fromInitial(initial) {
  if (!initial) return empty;
  return {
    name: initial.name ?? "",
    code: initial.code ?? "",
    description: initial.description ?? "",
    status: initial.status ?? "planning",
    color: initial.color ?? "#6366f1",
    start_date: initial.start_date ?? "",
    end_date: initial.end_date ?? "",
    budget: initial.budget ?? "",
    employee_ids: (initial.employees ?? initial.members ?? []).map((e) => e.id),
  };
}

/** Remounts the inner form whenever it opens for a different record, so state resets without effects. */
export default function ProjectForm({ open, onClose, initial = null, onSaved }) {
  if (!open) return null;
  return <ProjectFormInner key={initial?.id ?? "new"} onClose={onClose} initial={initial} onSaved={onSaved} />;
}

function ProjectFormInner({ onClose, initial, onSaved }) {
  const tr = useT();
  const [form, setForm] = useState(() => fromInitial(initial));
  const [codeTouched, setCodeTouched] = useState(!!initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();
  const { data: employees } = useFetch("/api/employees");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { ...form, budget: form.budget === "" ? null : Number(form.budget) };
      const saved = initial ? await api.put(`/api/projects/${initial.id}`, payload) : await api.post("/api/projects", payload);
      toast.success(initial ? "Project updated" : "Project created", saved.name);
      onSaved?.(saved, !initial);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const options = (employees ?? []).map((e) => ({
    value: e.id,
    label: fullName(e),
    sub: e.job_title,
    render: (o) => (
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <Avatar name={o.label} color={e.avatar_color} size="xs" />
        <span className="min-w-0">
          <span className="block truncate">{tr(o.label)}</span>
          <span className="block truncate text-xs text-fg-muted">{o.sub}</span>
        </span>
      </span>
    ),
  }));

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "Edit project" : "New project"}
      description={initial ? `Editing ${initial.name}` : "Projects group employees and tasks."}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>{tr("Cancel")}</Button>
          <Button type="submit" form="project-form" loading={saving}>{initial ? "Save changes" : "Create project"}</Button>
        </>
      }
    >
      <form id="project-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        <Field label={tr("Name")} required className="sm:col-span-4">
          <Input
            autoFocus
            value={form.name}
            onChange={(e) => {
              set("name", e.target.value);
              if (!codeTouched) set("code", toCode(e.target.value));
            }}
            placeholder="Orion Customer Portal"
            required
          />
        </Field>
        <Field label={tr("Code")} required className="sm:col-span-2" hint="Short unique key">
          <Input
            value={form.code}
            onChange={(e) => { setCodeTouched(true); set("code", e.target.value.toUpperCase()); }}
            placeholder="ORION"
            className="font-mono uppercase"
            required
            maxLength={32}
          />
        </Field>
        <Field label={tr("Status")} className="sm:col-span-2">
          <Select value={form.status} onChange={(e) => set("status", e.target.value)}>
            {Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
          </Select>
        </Field>
        <Field label="Start date" className="sm:col-span-2">
          <Input type="date" value={form.start_date || ""} onChange={(e) => set("start_date", e.target.value)} />
        </Field>
        <Field label="End date" className="sm:col-span-2">
          <Input type="date" value={form.end_date || ""} onChange={(e) => set("end_date", e.target.value)} />
        </Field>
        <Field label="Budget (USD)" className="sm:col-span-2">
          <Input type="number" min="0" step="100" value={form.budget ?? ""} onChange={(e) => set("budget", e.target.value)} placeholder="0" />
        </Field>
        <Field label="Colour" className="sm:col-span-4">
          <ColorPicker value={form.color} onChange={(c) => set("color", c)} />
        </Field>
        <Field label="Team members" className="sm:col-span-6" hint="Employees assigned to this project">
          <MultiSelect options={options} value={form.employee_ids} onChange={(v) => set("employee_ids", v)} placeholder="Pick employees…" />
        </Field>
        <Field label={tr("Description")} className="sm:col-span-6">
          <Textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="What is this project about?" rows={3} />
        </Field>
        {error ? <p className="sm:col-span-6 rounded-app-sm bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p> : null}
      </form>
    </Modal>
  );
}
