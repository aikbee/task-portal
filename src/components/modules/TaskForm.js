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
import { putTask } from "./shared";
import { REPEAT_RULES } from "@/lib/recurrence";
import MultiSelect from "@/components/ui/MultiSelect";
import { useT } from "@/lib/i18n";

const empty = { title: "", description: "", project_id: "", assignee_ids: [], requirement_id: "", status: "todo", priority: "medium", start_date: "", due_date: "", estimate_hours: "", tags: "", repeat_rule: "", repeat_until: "" };

function fromInitial(initial, defaults) {
  if (!initial) {
    const { employee_id, ...rest } = defaults ?? {};
    return { ...empty, ...rest, assignee_ids: rest.assignee_ids ?? (employee_id ? [Number(employee_id)] : []) };
  }
  return {
    title: initial.title ?? "",
    description: initial.description ?? "",
    project_id: initial.project_id ?? "",
    assignee_ids: initial.assignees?.length ? initial.assignees.map((p) => p.id) : initial.employee_id ? [initial.employee_id] : [],
    requirement_id: initial.requirement_id ?? "",
    status: initial.status ?? "todo",
    priority: initial.priority ?? "medium",
    start_date: initial.start_date ?? "",
    due_date: initial.due_date ?? "",
    estimate_hours: initial.estimate_hours ?? "",
    tags: String(initial.tags ?? "").split(",").filter(Boolean).join(", "),
    repeat_rule: initial.repeat_rule ?? "",
    repeat_until: initial.repeat_until ?? "",
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
  const { data: knownTags } = useFetch("/api/tasks/tags"); // this inner form only mounts while the dialog is open
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
  const people = useMemo(() => [...members.map((e) => ({ value: e.id, label: fullName(e), sub: tr("Project member"), color: e.avatar_color })), ...others.map((e) => ({ value: e.id, label: fullName(e), sub: e.job_title, color: e.avatar_color }))], [members, others, tr]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { ...form, start_date: form.start_date || null, due_date: form.due_date || null, estimate_hours: form.estimate_hours === "" ? null : form.estimate_hours, repeat_rule: form.repeat_rule || null, repeat_until: form.repeat_rule ? form.repeat_until || null : null };
      const saved = initial ? await putTask(initial.id, payload, { toast, tr }) : await api.post("/api/tasks", payload);
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
        <Field label={tr("Assignees")} className="sm:col-span-3" hint={form.assignee_ids.length > 1 ? tr("The first person leads the task.") : undefined}>
          <MultiSelect options={people} value={form.assignee_ids} onChange={(v) => set("assignee_ids", v)} placeholder={tr("Unassigned")} className="task-assignees-select" />
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
        <Field label={tr("Start date")} className="sm:col-span-2">
          <Input type="date" value={form.start_date || ""} max={form.due_date || undefined} onChange={(e) => set("start_date", e.target.value)} />
        </Field>
        <Field label={tr("Due date")} className="sm:col-span-2">
          <Input type="date" value={form.due_date || ""} min={form.start_date || undefined} onChange={(e) => set("due_date", e.target.value)} />
        </Field>
        <Field label={tr("Estimate (hours)")} className="sm:col-span-2">
          <Input type="number" min="0" max="9999" step="0.25" inputMode="decimal" value={form.estimate_hours ?? ""} onChange={(e) => set("estimate_hours", e.target.value)} placeholder="—" />
        </Field>
        <Field label={tr("Tags")} className="sm:col-span-2" hint={tr("Comma separated")}>
          <Input value={form.tags ?? ""} onChange={(e) => set("tags", e.target.value)} placeholder="bug, client-x" list="task-tag-suggestions" className="task-tags-input" />
          <datalist id="task-tag-suggestions">{(knownTags ?? []).map((t) => <option key={t.tag} value={t.tag} />)}</datalist>
        </Field>
        <Field label={tr("Repeats")} className="sm:col-span-3" hint={form.repeat_rule ? tr("Completing it creates the next one, counted from the due date.") : undefined}>
          <Select value={form.repeat_rule ?? ""} onChange={(e) => set("repeat_rule", e.target.value)} className="task-repeat-select">
            <option value="">{tr("Does not repeat")}</option>
            {Object.entries(REPEAT_RULES).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
          </Select>
        </Field>
        <Field label={tr("Repeat until")} className="sm:col-span-3">
          <Input type="date" value={form.repeat_until || ""} min={form.due_date || undefined} disabled={!form.repeat_rule} onChange={(e) => set("repeat_until", e.target.value)} />
        </Field>
        <Field label={tr("Description")} className="sm:col-span-6">
          <Textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={4} placeholder="Context, acceptance criteria, links…" />
        </Field>
        {error ? <p className="sm:col-span-6 rounded-app-sm bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p> : null}
      </form>
    </Modal>
  );
}
