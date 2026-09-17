"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { useAccess } from "@/lib/auth-context";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import ColorPicker from "@/components/ui/ColorPicker";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import { deletedToast } from "./shared";
import { useT } from "@/lib/i18n";

const blank = { title: "", all_day: true, start_date: "", end_date: "", start_time: "09:00", end_time: "10:00", location: "", description: "", project_id: "", color: "#0ea5e9" };

/** Create or edit a calendar event (a meeting, a holiday, a release): not a task, nothing to complete. */
export default function EventForm({ open, onClose, initial = null, defaults = {}, onSaved }) {
  if (!open) return null;
  return <EventFormInner key={initial?.id ?? "new"} onClose={onClose} initial={initial} defaults={defaults} onSaved={onSaved} />;
}

function EventFormInner({ onClose, initial, defaults, onSaved }) {
  const tr = useT();
  const toast = useToast();
  const { canEdit, canDelete } = useAccess();
  const { data: projects } = useFetch("/api/projects");
  const [form, setForm] = useState(() => (initial ? { ...blank, ...initial, all_day: Boolean(initial.all_day), start_time: initial.start_time ?? "09:00", end_time: initial.end_time ?? "", project_id: initial.project_id ?? "", location: initial.location ?? "", description: initial.description ?? "", color: initial.color ?? "#0ea5e9" } : { ...blank, ...defaults, end_date: defaults.end_date ?? defaults.start_date ?? "" }));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const readOnly = !canEdit;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { ...form, end_date: form.end_date || form.start_date, project_id: form.project_id || null, start_time: form.all_day ? null : form.start_time, end_time: form.all_day ? null : form.end_time || null };
      const saved = initial ? await api.put(`/api/events/${initial.id}`, payload) : await api.post("/api/events", payload);
      toast.success(tr(initial ? "Event updated" : "Event added"), saved.title);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    setDeleting(true);
    try {
      const gone = await api.del(`/api/events/${initial.id}`);
      deletedToast({ toast, tr, title: tr("Event deleted"), trashIds: [gone?.trash_id], onRestored: () => onSaved?.(null) });
      onSaved?.(null);
      onClose();
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={tr(initial ? (readOnly ? "Event" : "Edit event") : "New event")}
      description={tr("Meetings, holidays, releases: things that happen on a day without being work to complete.")}
      footer={
        <>
          {initial && canDelete ? <Button variant="dangerGhost" icon={Trash2} onClick={remove} loading={deleting} className="mr-auto event-delete">{tr("Delete")}</Button> : null}
          <Button variant="secondary" onClick={onClose} disabled={saving}>{tr(readOnly ? "Close" : "Cancel")}</Button>
          {readOnly ? null : <Button type="submit" form="event-form" loading={saving} className="event-save">{tr(initial ? "Save changes" : "Add event")}</Button>}
        </>
      }
    >
      <form id="event-form" onSubmit={submit} className="event-form">
        <fieldset disabled={readOnly} className="grid grid-cols-1 gap-4 sm:grid-cols-6">
          <Field label={tr("Title")} required className="sm:col-span-6">
            <Input autoFocus value={form.title} onChange={(e) => set("title", e.target.value)} required maxLength={200} placeholder={tr("Sprint review, public holiday, release day…")} className="event-title" />
          </Field>
          <div className="sm:col-span-6"><Toggle checked={form.all_day} onChange={(v) => set("all_day", v)} label={tr("All day")} size="sm" /></div>
          <Field label={tr("Starts")} required className="sm:col-span-3">
            <Input type="date" value={form.start_date || ""} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value, end_date: !f.end_date || f.end_date < e.target.value ? e.target.value : f.end_date }))} required className="event-start" />
          </Field>
          <Field label={tr("Ends")} className="sm:col-span-3">
            <Input type="date" value={form.end_date || ""} min={form.start_date || undefined} onChange={(e) => set("end_date", e.target.value)} />
          </Field>
          {!form.all_day ? (
            <>
              <Field label={tr("From")} required className="sm:col-span-3"><Input type="time" value={form.start_time || ""} onChange={(e) => set("start_time", e.target.value)} required className="event-from" /></Field>
              <Field label={tr("To")} className="sm:col-span-3"><Input type="time" value={form.end_time || ""} onChange={(e) => set("end_time", e.target.value)} /></Field>
            </>
          ) : null}
          <Field label={tr("Where")} className="sm:col-span-3"><Input value={form.location} onChange={(e) => set("location", e.target.value)} maxLength={200} placeholder={tr("Room, address or link")} /></Field>
          <Field label={tr("Project")} className="sm:col-span-3">
            <Select value={form.project_id ?? ""} onChange={(e) => set("project_id", e.target.value)}>
              <option value="">{tr("No project")}</option>
              {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label={tr("Notes")} className="sm:col-span-6"><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} /></Field>
          <Field label={tr("Colour")} className="sm:col-span-6"><ColorPicker value={form.color} onChange={(c) => set("color", c)} /></Field>
        </fieldset>
        {initial?.created_by_name ? <p className="mt-3 text-[11px] text-fg-faint">{tr("Added by {name}", { name: initial.created_by_name })}</p> : null}
        {error ? <p className="mt-3 rounded-app-sm bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p> : null}
      </form>
    </Modal>
  );
}
