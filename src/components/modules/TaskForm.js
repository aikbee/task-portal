"use client";
import { useMemo, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Input, Textarea, Select, Field } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { TASK_STATUS, TASK_PRIORITY } from "@/lib/modules";
import { fullName } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const empty = { title: "", description: "", project_id: "", employee_id: "", requirement_id: "", status: "todo", priority: "medium", due_date: "" };

function fromInitial(initial, defaults) {
  if (!initial) return { ...empty, ...defaults };
  return {
    title: initial.title ?? "",
    description: initial.description ?? "",
    project_id: initial.project_id ?? "",
    employee_id: initial.employee_id ?? "",
    requirement_id: initial.requirement_id ?? "",
    status: initial.status ?? "todo",
    priority: initial.priority ?? "medium",
    due_date: initial.due_date ?? "",
  };
}

/** defaults: pre-filled values for create (e.g. { project_id }) */
export default function TaskForm({ open, onClose, initial = null, defaults = {}, onSaved }) {
  if (!open) return null;
  return <TaskFormInner key={initial?.id ?? "new"} onClose={onClose} initial={initial} defaults={defaults} onSaved={onSaved} />;
}

function TaskFormInner({ onClose, initial, defaults, onSaved }) {
  const tr = useT();
  const [form, setForm] = useState(() => fromInitial(initial, defaults));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();
  const { data: projects } = useFetch("/api/projects");
  const { data: employees } = useFetch("/api/employees");
  const { data: requirements } = useFetch(form.project_id ? `/api/requirements?project_id=${form.project_id}` : null);
  const setProject = (v) => setForm((f) => ({ ...f, project_id: v, requirement_id: "" }));

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // members of the selected project float to the top of the assignee list
  const { members, others } = useMemo(() => {
    const list = employees ?? [];
    const proj = (projects ?? []).find((p) => String(p.id) === String(form.project_id));
    const memberIds = new Set((proj?.members ?? []).map((m) => m.id));
    return { members: list.filter((e) => memberIds.has(e.id)), others: list.filter((e) => !memberIds.has(e.id)) };
  }, [employees, projects, form.project_id]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = initial ? await api.put(`/api/tasks/${initial.id}`, form) : await api.post("/api/tasks", form);
      toast.success(initial ? "Task updated" : "Task created", saved.title);
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
      title={initial ? "Edit task" : "New task"}
      description={initial ? `Editing ${initial.title}` : "Attachments and outputs can be added after the task is created."}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>{tr("Cancel")}</Button>
          <Button type="submit" form="task-form" loading={saving}>{initial ? "Save changes" : "Create task"}</Button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        <Field label={tr("Title")} required className="sm:col-span-6">
          <Input autoFocus value={form.title} onChange={(e) => set("title", e.target.value)} required placeholder="What needs to be done?" />
        </Field>
        <Field label={tr("Project")} className="sm:col-span-3">
          <Select value={form.project_id ?? ""} onChange={(e) => setProject(e.target.value)}>
            <option value="">No project</option>
            {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
          </Select>
        </Field>
        <Field label={tr("Assignee")} className="sm:col-span-3">
          <Select value={form.employee_id ?? ""} onChange={(e) => set("employee_id", e.target.value)}>
            <option value="">{tr("Unassigned")}</option>
            {members.length ? (
              <optgroup label="Project members">
                {members.map((e) => <option key={e.id} value={e.id}>{fullName(e)} — {e.job_title}</option>)}
              </optgroup>
            ) : null}
            <optgroup label={members.length ? "Everyone else" : "Employees"}>
              {others.map((e) => <option key={e.id} value={e.id}>{fullName(e)} — {e.job_title}</option>)}
            </optgroup>
          </Select>
        </Field>
        <Field label={tr("Requirement")} className="sm:col-span-6" hint={form.project_id ? "Which requirement this task implements (optional)" : "Pick a project to link a requirement"}>
          <Select value={form.requirement_id ?? ""} onChange={(e) => set("requirement_id", e.target.value)} disabled={!form.project_id}>
            <option value="">Not linked</option>
            {(requirements ?? []).map((r) => <option key={r.id} value={r.id}>{r.code} · {r.title}</option>)}
          </Select>
        </Field>
        <Field label={tr("Status")} className="sm:col-span-2">
          <Select value={form.status} onChange={(e) => set("status", e.target.value)}>
            {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
          </Select>
        </Field>
        <Field label={tr("Priority")} className="sm:col-span-2">
          <Select value={form.priority} onChange={(e) => set("priority", e.target.value)}>
            {Object.entries(TASK_PRIORITY).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
          </Select>
        </Field>
        <Field label={tr("Due date")} className="sm:col-span-2">
          <Input type="date" value={form.due_date || ""} onChange={(e) => set("due_date", e.target.value)} />
        </Field>
        <Field label={tr("Description")} className="sm:col-span-6">
          <Textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={4} placeholder="Context, acceptance criteria, links…" />
        </Field>
        {error ? <p className="sm:col-span-6 rounded-app-sm bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p> : null}
      </form>
    </Modal>
  );
}
