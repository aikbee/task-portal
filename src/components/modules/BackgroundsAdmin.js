"use client";
import { useState } from "react";
import { Save, Check, Lock, Pencil, ListOrdered, RotateCcw, Ban, Gauge, Palette, SunMedium } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import { Toggle, Field, Input, Textarea, Segmented } from "@/components/ui/Controls";
import ColorPicker from "@/components/ui/ColorPicker";
import { useToast } from "@/components/ui/Toast";
import { Skeleton } from "@/components/ui/Misc";
import AnimatedBackground from "@/components/shell/AnimatedBackground";
import { BG_ICONS } from "@/components/shell/PreferencesDrawer";
import SortableList from "./SortableList";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { useUI } from "@/lib/store";
import { MODULE_MAP } from "@/lib/modules";
import { BG_STYLES, BG_KEYS, BG_TITLE_MAX, BG_DESC_MAX, BG_LOOK_DEFAULT, BG_SPEED, BG_BRIGHTNESS, normaliseBgSettings, orderedStyles, bgText } from "@/lib/backgrounds";
import { cn } from "@/lib/utils";
import { useT, useLocale, translate } from "@/lib/i18n";

/**
 * Admin: which background styles users may choose, the default, an optional lock, the order the styles are listed
 * in, and the titles and descriptions users see (English and Chinese; blank keeps the built-in text).
 */
export default function BackgroundsAdmin() {
  const tr = useT();
  const mod = MODULE_MAP.backgrounds;
  const { data, loading, error } = useFetch("/api/settings/backgrounds");
  if (error) return <p className="text-sm text-rose-500">{error.message}</p>;
  if (loading || !data) return <Skeleton className="h-96 w-full" />;
  return <Editor key={JSON.stringify(data)} initial={data} mod={mod} tr={tr} />;
}

function Editor({ initial, mod, tr }) {
  const toast = useToast();
  const locale = useLocale();
  const setBgSettings = useUI((s) => s.setBgSettings);
  const [form, setForm] = useState(() => normaliseBgSettings(initial));
  // what is saved: after a save it is the new starting point, so "Save changes" rests until the next change
  const [saved, setSaved] = useState(() => normaliseBgSettings(initial));
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // the style whose texts are being edited
  const [ordering, setOrdering] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const enabled = new Set(form.enabled);
  const text = (b) => bgText(b, form, locale, tr);
  // every change goes through normaliseBgSettings, so the form has one shape and "unsaved changes" is exact
  const update = (patch) => setForm((f) => normaliseBgSettings({ ...f, ...patch(f) }));

  const toggle = (key, on) => {
    const next = new Set(enabled);
    if (on) next.add(key);
    else next.delete(key);
    if (!next.size) return toast.error(tr("Keep at least one background enabled."));
    update((f) => {
      const list = f.order.filter((k) => next.has(k));
      return { enabled: list, default: list.includes(f.default) ? f.default : list[0] };
    });
  };
  const setDefault = (key) => update((f) => ({ default: key, enabled: f.enabled.includes(key) ? f.enabled : [...f.enabled, key] }));
  const setLook = (patch) => update((f) => ({ look: { ...f.look, ...patch } }));
  const lookChanged = JSON.stringify(form.look) !== JSON.stringify(BG_LOOK_DEFAULT);
  // "One colour for everyone" starts from the admin's own accent colour
  const ownAccent = () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#6366f1";
  const save = async () => {
    setSaving(true);
    try {
      const answer = normaliseBgSettings(await api.put("/api/settings/backgrounds", form));
      setBgSettings(answer);
      setForm(answer);
      setSaved(answer);
      toast.success(tr("Background settings saved"));
    } catch (e) {
      toast.error("Could not save", e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title={tr("Backgrounds")} description={tr(mod.description)} icon={mod.icon} color={mod.color} crumbs={[]} actions={<Button icon={Save} onClick={save} loading={saving} disabled={!dirty}>{tr("Save changes")}</Button>} />
      <Card className="mb-4 space-y-3">
        <Toggle checked={form.locked} onChange={(v) => update(() => ({ locked: v }))} label={tr("Lock the background for everyone")} description={tr("Users see the default below and cannot choose their own")} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-fg-muted">{tr("{n} of {total} styles enabled · default: {d}", { n: form.enabled.length, total: BG_STYLES.length, d: text(form.default).title })}</p>
          <Button size="sm" variant="outline" icon={ListOrdered} onClick={() => setOrdering(true)} data-testid="bg-order">{tr("Order")}</Button>
        </div>
      </Card>
      <Card className="mb-4 space-y-4" data-testid="bg-look">
        <div>
          <p className="text-sm font-semibold">{tr("Speed, colour and brightness")}</p>
          <p className="text-xs text-fg-muted">{tr("For every background and everyone. The previews below show it before you save.")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Slider icon={Gauge} label={tr("Animation speed")} value={form.look.speed} range={BG_SPEED} format={(v) => `${v}×`} onChange={(v) => setLook({ speed: v })} testid="bg-speed" />
          <Slider icon={SunMedium} label={tr("Brightness")} value={form.look.brightness} range={BG_BRIGHTNESS} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setLook({ brightness: v })} testid="bg-brightness" />
        </div>
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium"><Palette size={13} className="text-fg-muted" /> {tr("Colour")}</p>
          <Segmented
            value={form.look.color ? "fixed" : "user"}
            onChange={(v) => setLook({ color: v === "fixed" ? form.look.color ?? ownAccent() : null })}
            options={[{ value: "user", label: tr("Each user's accent colour") }, { value: "fixed", label: tr("One colour for everyone") }]}
            className="w-full sm:max-w-lg"
          />
          {form.look.color ? <ColorPicker value={form.look.color} onChange={(c) => setLook({ color: c })} className="mt-3" /> : null}
          <p className="mt-2 text-[11px] text-fg-muted">{tr("One colour replaces each user's accent colour in the backgrounds that use it (about two in three; landscapes keep their own colours).")}</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-fg-faint">{tr("A user who switched animation off, or asked for reduced motion, still sees a still background.")}</p>
          {lookChanged ? <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setLook(BG_LOOK_DEFAULT)}>{tr("Reset speed, colour and brightness")}</Button> : null}
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 anim-stagger">
        {orderedStyles(form).map((b) => {
          const on = enabled.has(b.value);
          const isDefault = form.default === b.value;
          const t = text(b);
          const edited = Boolean(form.names[b.value]);
          return (
            <Card key={b.value} padding={false} className={cn("overflow-hidden", !on && "opacity-60")} data-bg={b.value}>
              <div className="bg-preview aspect-[16/9] bg-bg" data-theme={undefined}>
                <AnimatedBackground preview={b.value} look={form.look} />
                {isDefault ? <span className="absolute left-2 top-2 z-10 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-white">{tr("Default")}</span> : null}
                {form.locked && isDefault ? <span className="absolute right-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-full bg-surface/90 text-accent"><Lock size={12} /></span> : null}
              </div>
              <div className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <span className="truncate">{t.title}</span>
                    {edited ? <span className="shrink-0 rounded-full bg-accent/10 px-1.5 py-px text-[10px] font-medium text-accent">{tr("Edited")}</span> : null}
                  </p>
                  <p className="text-[11px] text-fg-muted">{t.desc}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <button type="button" onClick={() => setDefault(b.value)} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]", isDefault ? "border-accent bg-accent/10 text-accent" : "border-line text-fg-muted hover:text-fg")}>
                      {isDefault ? <Check size={11} /> : null} {isDefault ? tr("Default") : tr("Make default")}
                    </button>
                    <button type="button" onClick={() => setEditing(b.value)} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] text-fg-muted hover:text-fg" data-testid={`bg-edit-${b.value}`}>
                      <Pencil size={11} /> {tr("Name and description")}
                    </button>
                  </div>
                </div>
                <Toggle checked={on} onChange={(v) => toggle(b.value, v)} label="" aria-label={t.title} />
              </div>
            </Card>
          );
        })}
      </div>
      {editing ? (
        <TextsDialog
          style={editing}
          names={form.names}
          tr={tr}
          onClose={() => setEditing(null)}
          onDone={(texts) => { update((f) => ({ names: { ...f.names, [editing]: texts } })); setEditing(null); }}
        />
      ) : null}
      {ordering ? (
        <OrderDialog
          order={form.order}
          enabled={enabled}
          text={text}
          tr={tr}
          onClose={() => setOrdering(false)}
          onDone={(order) => { update(() => ({ order })); setOrdering(false); }}
        />
      ) : null}
    </>
  );
}

/** A labelled range with its value shown (speed as ×, brightness as %). */
function Slider({ icon: Icon, label, value, range, format, onChange, testid }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-2 text-xs font-medium">
        <span className="flex items-center gap-1.5"><Icon size={13} className="text-fg-muted" /> {label}</span>
        <span className="font-mono text-fg-muted">{format(value)}</span>
      </span>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={(e) => onChange(Math.round(Number(e.target.value) * 100) / 100)}
        className="w-full accent-[var(--accent)]"
        data-testid={testid}
      />
    </label>
  );
}

/** One style's title and description in English and Chinese; blank fields keep the built-in text (shown in grey). */
function TextsDialog({ style, names, tr, onClose, onDone }) {
  const b = BG_STYLES.find((x) => x.value === style);
  const cur = names[style] ?? {};
  const [v, setV] = useState({ title: { en: cur.title?.en ?? "", zh: cur.title?.zh ?? "" }, desc: { en: cur.desc?.en ?? "", zh: cur.desc?.zh ?? "" } });
  const set = (field, lang) => (e) => { const value = e.target.value; setV((x) => ({ ...x, [field]: { ...x[field], [lang]: value } })); };
  const builtIn = { title: { en: b.label, zh: translate("zh-CN", b.label) }, desc: { en: b.desc, zh: translate("zh-CN", b.desc) } };
  const blank = { title: { en: "", zh: "" }, desc: { en: "", zh: "" } };
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={tr("Name and description")}
      description={tr("Leave a field blank to keep the built-in text, shown in grey.")}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" icon={RotateCcw} onClick={() => setV(blank)}>{tr("Use the built-in texts")}</Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>{tr("Cancel")}</Button>
            <Button icon={Check} onClick={() => onDone(v)} data-testid="bg-texts-done">{tr("Done")}</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tr("Title (English)")}><Input value={v.title.en} onChange={set("title", "en")} placeholder={builtIn.title.en} maxLength={BG_TITLE_MAX} data-testid="bg-title-en" /></Field>
          <Field label={tr("Title (Chinese)")}><Input value={v.title.zh} onChange={set("title", "zh")} placeholder={builtIn.title.zh} maxLength={BG_TITLE_MAX} lang="zh-CN" data-testid="bg-title-zh" /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tr("Description (English)")}><Textarea rows={3} value={v.desc.en} onChange={set("desc", "en")} placeholder={builtIn.desc.en} maxLength={BG_DESC_MAX} data-testid="bg-desc-en" /></Field>
          <Field label={tr("Description (Chinese)")}><Textarea rows={3} value={v.desc.zh} onChange={set("desc", "zh")} placeholder={builtIn.desc.zh} maxLength={BG_DESC_MAX} lang="zh-CN" data-testid="bg-desc-zh" /></Field>
        </div>
      </div>
    </Modal>
  );
}

/** The order users see the styles in: drag by the handle, use the arrows, or type a position. */
function OrderDialog({ order, enabled, text, tr, onClose, onDone }) {
  const [ids, setIds] = useState(order);
  const items = ids.map((k) => BG_STYLES.find((b) => b.value === k)).filter(Boolean);
  return (
    <Modal
      open
      onClose={onClose}
      title={tr("Order of the backgrounds")}
      description={tr("Users see the backgrounds in this order, on the web and in the app.")}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" icon={RotateCcw} onClick={() => setIds(BG_KEYS.slice())}>{tr("Built-in order")}</Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>{tr("Cancel")}</Button>
            <Button icon={Check} onClick={() => onDone(ids)} data-testid="bg-order-done">{tr("Done")}</Button>
          </div>
        </div>
      }
    >
      <SortableList
        items={items}
        getId={(b) => b.value}
        onReorder={setIds}
        className="space-y-1.5"
        renderItem={(b) => {
          const Icon = BG_ICONS[b.value] ?? Ban;
          const off = !enabled.has(b.value);
          return (
            <div className={cn("flex items-center gap-2.5 px-3 py-2", off && "opacity-55")} data-order-item={b.value}>
              <Icon size={15} className="shrink-0 text-fg-muted" />
              <span className="min-w-0 flex-1 truncate text-sm">{text(b).title}</span>
              {off ? <span className="shrink-0 text-[11px] text-fg-faint">{tr("Off")}</span> : null}
            </div>
          );
        }}
      />
    </Modal>
  );
}
