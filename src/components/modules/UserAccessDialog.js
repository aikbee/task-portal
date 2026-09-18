"use client";
import { useState } from "react";
import { Save, RotateCcw, ShieldCheck } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Controls";
import { Skeleton } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { MODULE_MAP } from "@/lib/modules";
import { useT } from "@/lib/i18n";

/** Admin: which modules and features one account may use. Everything is on until it is switched off here. */
export default function UserAccessDialog({ user, users = [], open, onClose, onSaved, defaults = false }) {
  const tr = useT();
  const toast = useToast();
  // `defaults`: the same switches, for the set that new accounts start with
  const url = defaults ? "/api/users/access-defaults" : `/api/users/${user?.id}/access`;
  const { data, loading } = useFetch(url, { enabled: Boolean(open && (defaults || user)) });
  const [draft, setDraft] = useState(null);
  const [seen, setSeen] = useState(null);
  const [busy, setBusy] = useState(false);
  if (data && data !== seen) { // derived during render: the form starts from what the server has
    setSeen(data);
    setDraft({ modules_off: new Set(data.access.modules_off), features_off: new Set(data.access.features_off) });
  }
  const isAdmin = data?.user?.role === "admin";
  const flip = (kind, key, on) => setDraft((d) => { const next = new Set(d[kind]); on ? next.delete(key) : next.add(key); return { ...d, [kind]: next }; });
  const blockedBy = (key) => { const base = data?.needs?.[key]; return base && draft?.modules_off.has(base) ? base : null; };
  const featureBlockedBy = (key) => { const base = data?.features?.[key]?.needs; return base && draft?.modules_off.has(base) ? base : null; };
  const copyFrom = async (id) => {
    if (!id) return;
    try {
      const other = await api.get(id === "defaults" ? "/api/users/access-defaults" : `/api/users/${id}/access`);
      setDraft({ modules_off: new Set(other.access.modules_off), features_off: new Set(other.access.features_off) });
    } catch (e) {
      toast.error(tr("Could not copy"), e.message);
    }
  };
  const save = async () => {
    setBusy(true);
    try {
      const res = await api.put(url, { modules_off: [...draft.modules_off], features_off: [...draft.features_off] });
      const n = res.effective.modules_off.length + res.effective.features_off.length;
      if (defaults) toast.success(tr("Defaults saved"), n ? tr("New accounts start with {n} things off. People who already have an account are not changed.", { n }) : tr("New accounts start with everything on."));
      else toast.success(tr("Access saved"), n ? tr("{n} things are off for {name}.", { n, name: res.user.name }) : tr("Everything is on for {name}.", { name: res.user.name }));
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(tr("Could not save"), e.message);
    } finally {
      setBusy(false);
    }
  };
  const close = () => { onClose(); setTimeout(() => { setSeen(null); setDraft(null); }, 300); };

  return (
    <Modal open={open} onClose={close} size="lg" className={defaults ? "user-access access-defaults" : "user-access"} title={defaults ? tr("What new accounts can use") : tr("What {name} can use", { name: user?.name ?? "" })} description={defaults ? tr("The set every new account starts with: the ones you create and the ones made by an invitation. You can still change each person afterwards; people who already have an account are not touched.") : tr("What is off disappears from their menus and pages, and the server refuses it too. It applies in every profile they open.")}
      footer={<><Button variant="ghost" icon={RotateCcw} onClick={() => setDraft({ modules_off: new Set(), features_off: new Set() })} disabled={busy || isAdmin} className="access-all-on">{tr("Everything on")}</Button><span className="flex-1" /><Button variant="ghost" onClick={close} disabled={busy}>{tr("Cancel")}</Button><Button icon={Save} onClick={save} loading={busy} disabled={!draft || isAdmin} className="access-save">{tr("Save")}</Button></>}>
      {loading && !data ? <Skeleton className="h-64 w-full" /> : null}
      {data && draft ? (
        <div className="space-y-5">
          {isAdmin ? <p className="flex items-start gap-2 rounded-app border border-amber-500/30 bg-amber-500/10 p-3 text-sm"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-amber-500" /> {tr("Administrators always have everything. Change the role to User to limit this account.")}</p> : null}
          <fieldset disabled={isAdmin} className={isAdmin ? "opacity-50" : ""}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-fg-faint">{tr("Modules")}</p>
              <select className="control access-copy h-8 w-auto py-0 text-xs" value="" onChange={(e) => copyFrom(e.target.value)}>
                <option value="">{tr("Copy from another user…")}</option>
                {!defaults ? <option value="defaults">{tr("Defaults for new accounts")}</option> : null}
                {users.filter((u) => u.id !== user?.id && u.role !== "admin").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="access-modules grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {data.modules.map((key) => {
                const base = blockedBy(key);
                return <Toggle key={key} size="sm" checked={!draft.modules_off.has(key) && !base} onChange={(on) => !base && flip("modules_off", key, on)} label={tr(MODULE_MAP[key]?.label ?? key)} description={base ? tr("Needs {name}", { name: tr(MODULE_MAP[base]?.label ?? base) }) : undefined} className={`access-module-${key} ${base ? "opacity-60" : ""}`} />;
              })}
            </div>
            <p className="mt-2 text-xs text-fg-muted">{tr("Dashboard, Profiles and Notifications are always on. With Projects, Employees or Requirements off, their names can still be picked on a task; their pages and details are closed.")}</p>
            <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-fg-faint">{tr("Features")}</p>
            <div className="access-features space-y-3">
              {Object.entries(data.features).map(([key, f]) => {
                const base = featureBlockedBy(key);
                return <Toggle key={key} size="sm" checked={!draft.features_off.has(key) && !base} onChange={(on) => !base && flip("features_off", key, on)} label={tr(f.label)} description={base ? tr("Needs {name}", { name: tr(MODULE_MAP[base]?.label ?? base) }) : tr(f.description)} className={`access-feature-${key} ${base ? "opacity-60" : ""}`} />;
              })}
            </div>
          </fieldset>
        </div>
      ) : null}
    </Modal>
  );
}
