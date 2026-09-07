"use client";
import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Input, Select, Field } from "@/components/ui/Controls";
import MultiSelect from "@/components/ui/MultiSelect";
import ColorPicker from "@/components/ui/ColorPicker";
import Avatar from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { EMPLOYEE_STATUS, DEPARTMENTS, PALETTE } from "@/lib/modules";
import { useT } from "@/lib/i18n";

const empty = { first_name: "", last_name: "", email: "", phone: "", job_title: "", department: "", status: "active", avatar_color: PALETTE[8], hired_at: "", project_ids: [] };

function fromInitial(initial) {
  if (!initial) return { ...empty, avatar_color: PALETTE[Math.floor(Math.random() * PALETTE.length)] };
  return {
    first_name: initial.first_name ?? "",
    last_name: initial.last_name ?? "",
    email: initial.email ?? "",
    phone: initial.phone ?? "",
    job_title: initial.job_title ?? "",
    department: initial.department ?? "",
    status: initial.status ?? "active",
    avatar_color: initial.avatar_color ?? PALETTE[8],
    hired_at: initial.hired_at ?? "",
    project_ids: (initial.projects ?? []).map((p) => p.id),
  };
}

export default function EmployeeForm({ open, onClose, initial = null, onSaved }) {
  if (!open) return null;
  return <EmployeeFormInner key={initial?.id ?? "new"} onClose={onClose} initial={initial} onSaved={onSaved} />;
}

function EmployeeFormInner({ onClose, initial, onSaved }) {
  const tr = useT();
  const [form, setForm] = useState(() => fromInitial(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();
  const { data: projects } = useFetch("/api/projects");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = initial ? await api.put(`/api/employees/${initial.id}`, form) : await api.post("/api/employees", form);
      toast.success(initial ? "Employee updated" : "Employee added", `${saved.first_name} ${saved.last_name}`);
      onSaved?.(saved, !initial);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const options = (projects ?? []).map((p) => ({ value: p.id, label: p.name, sub: p.code, color: p.color }));
  const name = `${form.first_name} ${form.last_name}`.trim() || "New employee";

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "Edit employee" : "New employee"}
      description={initial ? `Editing ${initial.first_name} ${initial.last_name}` : "Employees belong to projects and own tasks."}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>{tr("Cancel")}</Button>
          <Button type="submit" form="employee-form" loading={saving}>{initial ? "Save changes" : "Add employee"}</Button>
        </>
      }
    >
      <form id="employee-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        <div className="sm:col-span-6 flex items-center gap-4 rounded-app border border-line bg-surface-2 p-3">
          <Avatar name={name} color={form.avatar_color} size="xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-xs text-fg-muted">{form.job_title || "Job title"} {form.department ? `· ${form.department}` : ""}</p>
            <ColorPicker value={form.avatar_color} onChange={(c) => set("avatar_color", c)} className="mt-2" />
          </div>
        </div>
        <Field label="First name" required className="sm:col-span-3">
          <Input autoFocus value={form.first_name} onChange={(e) => set("first_name", e.target.value)} required />
        </Field>
        <Field label="Last name" required className="sm:col-span-3">
          <Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} required />
        </Field>
        <Field label={tr("Email")} required className="sm:col-span-3">
          <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required placeholder="name@company.com" />
        </Field>
        <Field label={tr("Phone")} className="sm:col-span-3">
          <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="+1 555 0100" />
        </Field>
        <Field label="Job title" className="sm:col-span-3">
          <Input value={form.job_title ?? ""} onChange={(e) => set("job_title", e.target.value)} placeholder="Backend Engineer" />
        </Field>
        <Field label={tr("Department")} className="sm:col-span-3">
          <Input list="departments" value={form.department ?? ""} onChange={(e) => set("department", e.target.value)} placeholder="Engineering" />
          <datalist id="departments">{DEPARTMENTS.map((d) => <option key={d} value={d} />)}</datalist>
        </Field>
        <Field label={tr("Status")} className="sm:col-span-3">
          <Select value={form.status} onChange={(e) => set("status", e.target.value)}>
            {Object.entries(EMPLOYEE_STATUS).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
          </Select>
        </Field>
        <Field label="Hired on" className="sm:col-span-3">
          <Input type="date" value={form.hired_at || ""} onChange={(e) => set("hired_at", e.target.value)} />
        </Field>
        <Field label={tr("Projects")} className="sm:col-span-6" hint="Projects this employee is a member of">
          <MultiSelect options={options} value={form.project_ids} onChange={(v) => set("project_ids", v)} placeholder="Pick projects…" />
        </Field>
        {error ? <p className="sm:col-span-6 rounded-app-sm bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p> : null}
      </form>
    </Modal>
  );
}
