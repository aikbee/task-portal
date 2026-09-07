"use client";
import Link from "next/link";
import { ChevronDown, Check, Layers, Plus, Settings2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Popover } from "@/components/ui/Popover";
import { useT } from "@/lib/i18n";

/** Active profile chip with a menu to switch between the user's profiles. */
export default function ProfileSwitcher({ collapsed = false }) {
  const tr = useT();
  const { user, switchProfile } = useAuth();
  const profile = user?.profile;
  const profiles = user?.profiles ?? [];
  if (!profile) return null;

  return (
    <Popover
      align="start"
      side="bottom"
      width={260}
      className={collapsed ? "flex justify-center" : "block w-full"}
      trigger={({ toggle, open }) => (
        <button
          onClick={toggle}
          data-tip={collapsed ? `Profile: ${profile.name}` : undefined}
          data-tip-pos="right"
          className={cn(
            "flex items-center gap-2 rounded-app-sm border border-line bg-surface/60 text-left transition hover:bg-surface-2",
            collapsed ? "h-9 w-9 justify-center" : "w-full px-2 py-1.5",
            open && "border-accent/40"
          )}
          aria-label={tr("Switch profile")}
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-white" style={{ background: profile.color }}>
            <Layers size={13} />
          </span>
          {!collapsed ? (
            <>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-[10px] uppercase tracking-wider text-fg-faint">{tr("Profile")}</span>
                <span className="block truncate text-xs font-medium">{profile.name}</span>
              </span>
              <ChevronDown size={13} className="shrink-0 text-fg-faint" />
            </>
          ) : null}
        </button>
      )}
    >
      {({ close }) => (
        <div className="p-1">
          <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-faint">{tr("Switch profile")}</p>
          {profiles.map((p) => {
            const active = p.id === profile.id;
            return (
              <button
                key={p.id}
                onClick={() => {
                  close();
                  if (!active) switchProfile(p.id, "/");
                }}
                className={cn("flex w-full items-center gap-2.5 rounded-app-sm px-2.5 py-2 text-left text-sm hover:bg-surface-2", active && "bg-accent/8")}
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-white" style={{ background: p.color }}>
                  <Layers size={12} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  {p.description ? <span className="block truncate text-[11px] text-fg-muted">{p.description}</span> : null}
                </span>
                {p.is_default ? <span className="rounded-full bg-surface-3 px-1.5 text-[10px] text-fg-muted">{tr("default")}</span> : null}
                {active ? <Check size={14} className="text-accent" /> : null}
              </button>
            );
          })}
          <div className="my-1 h-px bg-line" />
          <Link href="/profiles?new=1" onClick={close} className="flex items-center gap-2.5 rounded-app-sm px-2.5 py-2 text-sm text-fg hover:bg-surface-2">
            <Plus size={15} className="text-fg-muted" /> New profile
          </Link>
          <Link href="/profiles" onClick={close} className="flex items-center gap-2.5 rounded-app-sm px-2.5 py-2 text-sm text-fg hover:bg-surface-2">
            <Settings2 size={15} className="text-fg-muted" /> Manage profiles
          </Link>
        </div>
      )}
    </Popover>
  );
}
