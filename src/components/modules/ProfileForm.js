"use client";
import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Input, Field, Checkbox } from "@/components/ui/Controls";
import ColorPicker from "@/components/ui/ColorPicker";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { PALETTE } from "@/lib/modules";
import { useT } from "@/lib/i18n";

export default function ProfileForm({ open, onClose, initial = null, onSaved }) {
  if (!open) return null;
  return <ProfileFormInner key={initial?.id ?? "new"} onClose={onClose} initial={initial} onSaved={onSaved} />;
}

function ProfileFormInner({ onClose, initial, onSaved }) {
  const tr = useT();
  const [form, setForm] = useState(() => ({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    color: initial?.color ?? PALETTE[Math.floor(Math.random() * PALETTE.length)],
    is_default: Boolean(initial?.is_default),
    switch_after: !initial,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { name: form.name, description: form.description, color: form.color, is_default: form.is_default };
      const saved = initial ? await api.put(`/api/profiles/${initial.id}`, payload) : await api.post("/api/profiles", payload);
      if (!initial && form.is_default) await api.put(`/api/profiles/${saved.id}`, { is_default: true });
      toast.success(initial ? "Profile updated" : "Profile created", saved.name);
      onSaved?.(saved, !initial, form.switch_after);
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
      title={initial ? "Edit profile" : "New profile"}
      description={initial ? `Editing ${initial.name}` : "A profile is a separate set of projects, requirements, employees and tasks."}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>{tr("Cancel")}</Button>
          <Button type="submit" form="profile-form" loading={saving}>{initial ? "Save changes" : "Create profile"}</Button>
        </>
      }
    >
      <form id="profile-form" onSubmit={submit} className="space-y-4">
        <Field label={tr("Name")} required>
          <Input autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} required maxLength={80} placeholder="Client work, Side projects, 2027 planning…" />
        </Field>
        <Field label={tr("Description")}>
          <Input value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={255} placeholder="What lives in this profile" />
        </Field>
        <Field label="Colour">
          <ColorPicker value={form.color} onChange={(c) => set("color", c)} />
        </Field>
        <Checkbox checked={form.is_default} onChange={(v) => set("is_default", v)} label="Make this my default profile" />
        {!initial ? <Checkbox checked={form.switch_after} onChange={(v) => set("switch_after", v)} label="Switch to it right away" /> : null}
        {error ? <p className="rounded-app-sm bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p> : null}
      </form>
    </Modal>
  );
}
