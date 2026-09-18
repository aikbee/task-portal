"use client";
import { useState } from "react";
import { Pencil, Check } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import MultiSelect from "@/components/ui/MultiSelect";
import { Field, Select, Input } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { TASK_STATUS, TASK_PRIORITY } from "@/lib/modules";
import { fullName } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useFeature } from "@/lib/auth-context";

const blank = { status: "", priority: "", project: "", people_mode: "", people: [], due_mode: "", due_date: "", shift: "", start_mode: "", start_date: "", add_tags: "", remove_tags: "" };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** Change several tasks in one go. Every field starts at "No change"; what is applied can be undone from the toast. */
export default function BulkEditTasks({ ids, open, onClose, onDone }) {
  const tr = useT();
  const toast = useToast();
  const { data: projects } = useFetch("/api/projects", { enabled: open });
  const { data: employees } = useFetch("/api/employees", { enabled: open });
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const people = (employees ?? []).map((e) => ({ value: e.id, label: fullName(e), color: e.avatar_color }));

  const patch = {};
  if (f.status) patch.status = f.status;
  if (f.priority) patch.priority = f.priority;
  if (f.project) patch.project_id = f.project === "none" ? null : Number(f.project);
  if (f.people_mode && (f.people.length || f.people_mode === "replace")) { patch.assignee_mode = f.people_mode; patch.assignee_ids = f.people; }
  if (f.due_mode === "set" && f.due_date) patch.due_date = f.due_date;
  if (f.due_mode === "clear") patch.due_date = null;
  if (f.due_mode === "shift" && Number(f.shift)) patch.shift_days = Math.trunc(Number(f.shift));
  if (f.due_mode !== "shift" && f.start_mode === "set" && f.start_date) patch.start_date = f.start_date;
  if (f.due_mode !== "shift" && f.start_mode === "clear") patch.start_date = null;
  if (f.add_tags.trim()) patch.add_tags = f.add_tags;
  if (f.remove_tags.trim()) patch.remove_tags = f.remove_tags;
  const changes = Object.keys(patch).filter((k) => k !== "assignee_ids").length;

  const close = () => { onClose(); setTimeout(() => setF(blank), 300); };
  const undo = async (items) => {
    try {
      const res = await api.post("/api/tasks/bulk", { items });
      toast.success(tr("Put back: {n} tasks", { n: res.updated }));
      onDone?.();
    } catch (e) {
      toast.error(tr("Could not undo"), e.message);
    }
  };
  const apply = async () => {
    setBusy(true);
    try {
      const res = await api.post("/api/tasks/bulk", { ids, patch: { ...patch, today: today() } });
      const notes = [res.failed.length ? tr("{n} could not be changed: {why}", { n: res.failed.length, why: res.failed[0].error }) : null, res.spawned ? tr("{n} repeating tasks made their next one.", { n: res.spawned }) : null].filter(Boolean).join(" ");
      toast.show({ type: res.updated ? "success" : "error", title: tr("{n} tasks changed", { n: res.updated }), description: notes || undefined, action: res.undo.length ? { label: tr("Undo"), onClick: () => undo(res.undo) } : null });
      onDone?.();
      close();
    } catch (e) {
      toast.error(tr("Could not change the tasks"), e.message);
    } finally {
      setBusy(false);
    }
  };

  const same = <option value="">{tr("No change")}</option>;
  return (
    <Modal open={open} onClose={close} size="lg" className="bulk-edit" title={tr("Change {n} tasks", { n: ids.length })} description={tr("Only what you set here changes; everything else stays as it is on each task.")}
      footer={<><Button variant="ghost" onClick={close} disabled={busy}>{tr("Cancel")}</Button><Button icon={Check} onClick={apply} loading={busy} disabled={!changes} className="bulk-apply">{tr("Apply to {n} tasks", { n: ids.length })}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tr("Status")}><Select value={f.status} onChange={set("status")} className="bulk-status">{same}{Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}</Select></Field>
        <Field label={tr("Priority")}><Select value={f.priority} onChange={set("priority")} className="bulk-priority">{same}{Object.entries(TASK_PRIORITY).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}</Select></Field>
        <Field label={tr("Project")} className="sm:col-span-2" hint={tr("Moving a task to another project drops its requirement link.")}><Select value={f.project} onChange={set("project")} className="bulk-project">{same}<option value="none">{tr("No project")}</option>{(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label={tr("Assignees")} className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            <Select value={f.people_mode} onChange={set("people_mode")} className="bulk-people-mode w-44">{same}<option value="add">{tr("Add these people")}</option><option value="replace">{tr("Replace with")}</option><option value="remove">{tr("Remove these people")}</option></Select>
            {f.people_mode ? <MultiSelect options={people} value={f.people} onChange={set("people")} placeholder={f.people_mode === "replace" ? tr("Nobody (unassign)") : tr("Pick people")} className="bulk-people min-w-[14rem] flex-1" /> : null}
          </div>
        </Field>
        <Field label={tr("Due date")} hint={f.due_mode === "shift" ? tr("Moves the start and due dates of tasks that have them. Negative numbers move earlier.") : undefined}>
          <div className="flex gap-2">
            <Select value={f.due_mode} onChange={set("due_mode")} className="bulk-due-mode w-40">{same}<option value="set">{tr("Set to")}</option><option value="shift">{tr("Move by days")}</option><option value="clear">{tr("Clear")}</option></Select>
            {f.due_mode === "set" ? <Input type="date" value={f.due_date} onChange={set("due_date")} className="bulk-due-date flex-1" /> : null}
            {f.due_mode === "shift" ? <Input type="number" value={f.shift} onChange={set("shift")} placeholder="7" className="bulk-shift w-24" /> : null}
          </div>
        </Field>
        <Field label={tr("Start date")}>
          <div className="flex gap-2">
            <Select value={f.due_mode === "shift" ? "" : f.start_mode} onChange={set("start_mode")} disabled={f.due_mode === "shift"} className="bulk-start-mode w-40">{same}<option value="set">{tr("Set to")}</option><option value="clear">{tr("Clear")}</option></Select>
            {f.start_mode === "set" && f.due_mode !== "shift" ? <Input type="date" value={f.start_date} onChange={set("start_date")} className="flex-1" /> : null}
          </div>
        </Field>
        <Field label={tr("Add tags")}><Input value={f.add_tags} onChange={set("add_tags")} placeholder="launch, client-x" className="bulk-add-tags" /></Field>
        <Field label={tr("Remove tags")}><Input value={f.remove_tags} onChange={set("remove_tags")} placeholder="old-tag" className="bulk-remove-tags" /></Field>
      </div>
    </Modal>
  );
}

/** The "Edit" button for a table's selection bar. */
export function BulkEditButton({ ids, clear, onDone }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const allowed = useFeature("bulk_edit");
  if (!allowed) return null;
  return (
    <>
      <Button size="xs" variant="secondary" icon={Pencil} onClick={() => setOpen(true)} className="bulk-open">{tr("Edit")}</Button>
      <BulkEditTasks ids={ids} open={open} onClose={() => setOpen(false)} onDone={() => { clear?.(); onDone?.(); }} />
    </>
  );
}
