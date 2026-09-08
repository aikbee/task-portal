"use client";
import { usePathname } from "next/navigation";
import { StickyNote, Timer, Calculator, Keyboard, X, Minimize2 } from "lucide-react";
import { useUI, usePrefs } from "@/lib/store";
import { moduleFromPath } from "@/lib/modules";
import { useMediaQuery } from "@/lib/hooks";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";
import StickyNotes from "./tools/StickyNotes";
import NotesWorkspace from "./tools/NotesWorkspace";
import TimerTool, { TimerWorkspace } from "./tools/TimerTool";
import CalcTool, { CalcWorkspace } from "./tools/CalcTool";
import ShortcutsTool from "./tools/ShortcutsTool";

const ShortcutsWide = () => <div className="min-h-0 flex-1 overflow-y-auto"><ShortcutsTool wide /></div>;

/** Bottom-bar tools: the compact popover (`Component`) and the full-screen view (`Workspace`). */
export const TOOLS = [
  { key: "notes", label: "Notes", icon: StickyNote, hint: "⌘J", Component: StickyNotes, Workspace: NotesWorkspace, width: "w-[720px]" },
  { key: "timer", label: "Timer", icon: Timer, Component: TimerTool, Workspace: TimerWorkspace, width: "w-80" },
  { key: "calc", label: "Calculator", icon: Calculator, Component: CalcTool, Workspace: CalcWorkspace, width: "w-80" },
  { key: "shortcuts", label: "Shortcuts", icon: Keyboard, hint: "?", Component: ShortcutsTool, Workspace: ShortcutsWide, width: "w-96" },
];

/** True when tools should take the whole screen: the user asked for it, or the screen is a phone. */
export function useToolExpanded() {
  const pref = usePrefs((s) => s.toolExpanded);
  const isMobile = useMediaQuery("(max-width: 767px)");
  return pref || isMobile;
}

/** The full-screen tool view. Rendered by the shell so it works even when the bottom bar is hidden. */
export default function ToolWorkspace() {
  const tr = useT();
  const pathname = usePathname();
  const mod = moduleFromPath(pathname);
  const activeTool = useUI((s) => s.activeTool);
  const closeTool = useUI((s) => s.closeTool);
  const setPrefs = usePrefs((s) => s.set);
  const expanded = useToolExpanded();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const tool = TOOLS.find((t) => t.key === activeTool);
  if (!tool || !expanded) return null;

  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-bg anim-fade" role="dialog" aria-modal="true" aria-label={tr(tool.label)}>
      <header className="flex h-12 shrink-0 items-center gap-2 glass border-b px-3" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <tool.icon size={16} className="text-accent" />
        <span className="text-sm font-semibold">{tr(tool.label)}</span>
        {tool.key === "notes" ? <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] text-fg-muted">{tr(mod.label)}</span> : null}
        <span className="flex-1" />
        {!isMobile ? <Button variant="ghost" size="sm" icon={Minimize2} onClick={() => setPrefs({ toolExpanded: false })}>{tr("Collapse to panel")}</Button> : null}
        <Button variant="ghost" size="icon" icon={X} onClick={closeTool} aria-label={tr("Close")} />
      </header>
      <div className="flex min-h-0 flex-1" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <tool.Workspace key={mod.key} module={mod} />
      </div>
    </div>
  );
}
