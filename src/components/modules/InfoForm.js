"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Input, Textarea, Select, Field, Checkbox } from "@/components/ui/Controls";
import ColorPicker from "@/components/ui/ColorPicker";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { INFO_CATEGORY, PALETTE } from "@/lib/modules";
import { useFetch } from "@/lib/hooks";
import { useT } from "@/lib/i18n";

const empty = { title: "", category: "note", project_id: "", tags: "", summary: "", content: "", url: "", username: "", secret: "", secret_hint: "", pinned: false, color: PALETTE[6], clearSecret: false };

function fromInitial(initial, defaults) {
  if (!initial) return { ...empty, ...defaults, color: defaults?.color ?? PALETTE[Math.floor(Math.random() * PALETTE.length)] };
  return {
    title: initial.title ?? "",
    category: initial.category ?? "note",
    project_id: initial.project_id ?? "",
    tags: (initial.tags ?? "").split(",").filter(Boolean).join(", "),
    summary: initial.summary ?? "",
    content: initial.content ?? "",
    url: initial.url ?? "",
    username: initial.username ?? "",
    secret: "",
    secret_hint: initial.secret_hint ?? "",
    pinned: Boolean(initial.pinned),
    color: initial.color ?? PALETTE[6],
    clearSecret: false,
  };
}

export default function InfoForm({ open, onClose, initial = null, defaults = {}, onSaved }) {
  if (!open) return null;
  return <InfoFormInner key={initial?.id ?? "new"} onClose={onClose} initial={initial} defaults={defaults} onSaved={onSaved} />;
}

function InfoFormInner({ onClose, initial, defaults, onSaved }) {
  const tr = useT();
  const [form, setForm] = useState(() => fromInitial(initial, defaults));
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();
  const { data: projects } = useFetch("/api/projects");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const isCredential = form.category === "credential";
  const isLink = form.category === "link";

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { title: form.title, category: form.category, project_id: form.project_id || null, tags: form.tags, summary: form.summary, content: form.content, url: form.url, username: form.username, secret_hint: form.secret_hint, pinned: form.pinned, color: form.color };
      if (form.clearSecret) payload.secret = null;
      else if (form.secret) payload.secret = form.secret;
      const saved = initial ? await api.put(`/api/info/${initial.id}`, payload) : await api.post("/api/info", payload);
      toast.success(initial ? "Info updated" : "Info saved", saved.title);
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
      title={initial ? "Edit info" : "New info"}
      description={initial ? `Editing ${initial.title}` : "A guideline, a credential, a link or any reference you want to keep close. Notes and attachments can be added after saving."}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>{tr("Cancel")}</Button>
          <Button type="submit" form="info-form" loading={saving}>{initial ? "Save changes" : "Save info"}</Button>
        </>
      }
    >
      <form id="info-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        <Field label={tr("Title")} required className="sm:col-span-4">
          <Input autoFocus value={form.title} onChange={(e) => set("title", e.target.value)} required placeholder="Deployment checklist, Staging DB password, Brand guidelines…" />
        </Field>
        <Field label={tr("Category")} className="sm:col-span-2">
          <Select value={form.category} onChange={(e) => set("category", e.target.value)}>
            {Object.entries(INFO_CATEGORY).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
          </Select>
        </Field>
        <Field label={tr("Project")} className="sm:col-span-3" hint="Optional — filter info by project">
          <Select value={form.project_id ?? ""} onChange={(e) => set("project_id", e.target.value)}>
            <option value="">Not linked to a project</option>
            {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
          </Select>
        </Field>
        <Field label={tr("Summary")} className="sm:col-span-3" hint="One line shown in the list">
          <Input value={form.summary} onChange={(e) => set("summary", e.target.value)} maxLength={500} placeholder="What this is about" />
        </Field>
        <Field label={tr("Tags")} className="sm:col-span-4" hint="Comma separated">
          <Input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="onboarding, infra, client-x" />
        </Field>
        <Field label="Colour" className="sm:col-span-2">
          <ColorPicker value={form.color} onChange={(c) => set("color", c)} />
        </Field>
        {isCredential || isLink || form.url || form.username ? (
          <Field label="URL" className="sm:col-span-6">
            <Input value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://…" />
          </Field>
        ) : null}
        {isCredential ? (
          <>
            <Field label="Username / account" className="sm:col-span-3">
              <Input value={form.username} onChange={(e) => set("username", e.target.value)} autoComplete="off" placeholder="admin@example.com" />
            </Field>
            <Field label={initial?.has_secret ? "New secret" : "Secret / password"} className="sm:col-span-3" hint={initial?.has_secret ? "Leave empty to keep the stored secret" : "Encrypted at rest; shown only on demand"}>
              <div className="relative">
                <Input type={showSecret ? "text" : "password"} autoComplete="new-password" value={form.secret} onChange={(e) => set("secret", e.target.value)} className="pr-10 font-mono" disabled={form.clearSecret} />
                <button type="button" onClick={() => setShowSecret((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-faint hover:text-fg" aria-label={showSecret ? "Hide" : "Show"}>
                  {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </Field>
            <Field label="Secret hint" className="sm:col-span-6" hint="Shown next to the masked secret, e.g. “rotated monthly”">
              <Input value={form.secret_hint} onChange={(e) => set("secret_hint", e.target.value)} maxLength={120} />
            </Field>
            {initial?.has_secret ? <Checkbox className="sm:col-span-6" checked={form.clearSecret} onChange={(v) => set("clearSecret", v)} label="Remove the stored secret" /> : null}
          </>
        ) : null}
        <Field label={tr("Content")} className="sm:col-span-6" hint="The main body — guidelines, steps, background. More notes can be added on the item page.">
          <Textarea value={form.content} onChange={(e) => set("content", e.target.value)} rows={5} placeholder="Write it down…" />
        </Field>
        <Checkbox className="sm:col-span-6" checked={form.pinned} onChange={(v) => set("pinned", v)} label="Pin to the top of the list" />
        {error ? <p className="sm:col-span-6 rounded-app-sm bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p> : null}
      </form>
    </Modal>
  );
}
