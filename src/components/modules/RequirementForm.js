"use client";
import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Input, Textarea, Select, Field } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { REQ_TYPE, REQ_PRIORITY, REQ_STATUS } from "@/lib/modules";
import { fullName } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const empty = { project_id: "", code: "", title: "", description: "", acceptance_criteria: "", type: "functional", priority: "should", status: "draft", employee_id: "" };

function fromInitial(initial, defaults) {
  if (!initial) return { ...empty, ...defaults };
  return {
    project_id: initial.project_id ?? "",
    code: initial.code ?? "",
    title: initial.title ?? "",
    description: initial.description ?? "",
    acceptance_criteria: initial.acceptance_criteria ?? "",
    type: initial.type ?? "functional",
    priority: initial.priority ?? "should",
    status: initial.status ?? "draft",
    employee_id: initial.employee_id ?? "",
  };
}

/** defaults: pre-filled values for create (e.g. { project_id }) */
export default function RequirementForm({ open, onClose, initial = null, defaults = {}, onSaved }) {
  if (!open) return null;
  return <RequirementFormInner key={initial?.id ?? "new"} onClose={onClose} initial={initial} defaults={defaults} onSaved={onSaved} />;
}

function RequirementFormInner({ onClose, initial, defaults, onSaved }) {
  const tr = useT();
  const [form, setForm] = useState(() => fromInitial(initial, defaults));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();
  const { data: projects } = useFetch("/api/projects");
  const { data: employees } = useFetch("/api/employees");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { ...form };
      if (!initial && !payload.code.trim()) delete payload.code; // let the server assign REQ-nnn
      const saved = initial ? await api.put(`/api/requirements/${initial.id}`, payload) : await api.post("/api/requirements", payload);
      toast.success(initial ? "Requirement updated" : "Requirement created", `${saved.code} · ${saved.title}`);
      onSaved?.(saved, !initial);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? `Edit ${initial.code}` : "New requirement"}
      description={initial ? initial.title : "Describe what the project must deliver and how you will know it is done. Codes are assigned automatically unless you set one."}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>{tr("Cancel")}</Button>
          <Button type="submit" form="requirement-form" loading={saving}>{initial ? "Save changes" : "Create requirement"}</Button>
        </>
      }
    >
      <form id="requirement-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        <Field label={tr("Project")} required className="sm:col-span-3" hint={initial ? "Moving to another project assigns a new code" : undefined}>
          <Select value={form.project_id ?? ""} onChange={(e) => set("project_id", e.target.value)} required>
            <option value="">Choose a project…</option>
            {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
          </Select>
        </Field>
        <Field label={tr("Stakeholder")} className="sm:col-span-3" hint="Who owns or requested this">
          <Select value={form.employee_id ?? ""} onChange={(e) => set("employee_id", e.target.value)}>
            <option value="">{tr("Unassigned")}</option>
            {(employees ?? []).map((e) => <option key={e.id} value={e.id}>{fullName(e)} — {e.job_title}</option>)}
          </Select>
        </Field>
        <Field label={tr("Code")} required={!!initial} className="sm:col-span-2" hint={initial ? "Unique within the project" : "Leave empty for the next REQ-nnn"}>
          <Input
            value={form.code}
            onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9._-]/g, ""))}
            placeholder={initial ? "REQ-001" : "Auto"}
            className="font-mono uppercase"
            maxLength={32}
            required={!!initial}
          />
        </Field>
        <Field label={tr("Title")} required className="sm:col-span-4">
          <Input autoFocus value={form.title} onChange={(e) => set("title", e.target.value)} required placeholder="Customers can download invoices as PDF" />
        </Field>
        <Field label={tr("Type")} className="sm:col-span-2">
          <Select value={form.type} onChange={(e) => set("type", e.target.value)}>
            {Object.entries(REQ_TYPE).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
          </Select>
        </Field>
        <Field label="Priority (MoSCoW)" className="sm:col-span-2">
          <Select value={form.priority} onChange={(e) => set("priority", e.target.value)}>
            {Object.entries(REQ_PRIORITY).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
          </Select>
        </Field>
        <Field label={tr("Status")} className="sm:col-span-2">
          <Select value={form.status} onChange={(e) => set("status", e.target.value)}>
            {Object.entries(REQ_STATUS).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
          </Select>
        </Field>
        <Field label={tr("Description")} className="sm:col-span-6">
          <Textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={4} placeholder="What is needed and why. Context, constraints, references…" />
        </Field>
        <Field label={tr("Acceptance criteria")} className="sm:col-span-6" hint="One per line — how you will verify it is done">
          <Textarea value={form.acceptance_criteria ?? ""} onChange={(e) => set("acceptance_criteria", e.target.value)} rows={4} placeholder={"- Invoices paginate 25 per page\n- PDF download under 2s"} className="font-mono text-[13px]" />
        </Field>
        {error ? <p className="sm:col-span-6 rounded-app-sm bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p> : null}
      </form>
    </Modal>
  );
}
