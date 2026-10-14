"use client";
import { createContext, useContext, useMemo, useState } from "react";
import { ChevronDown, GripVertical, ArrowUp, ArrowDown, ArrowRight, ArrowLeft, Eye, EyeOff, RotateCcw, Check, LayoutDashboard } from "lucide-react";
import { usePrefs } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import Button from "./Button";

/**
 * The cards of a detail page (a task, a requirement…) as each person likes them: any card can be collapsed to its
 * header, and in arrange mode the cards are put in another order, moved to the other column or hidden. Kept per kind
 * of page in the preferences (`cardLayouts`), so every task opens the way the last one was left.
 *
 *   <DetailCards page="task" arranging={arranging} onDone={() => setArranging(false)} slots={[
 *     { id: "checklist", title: tr("Checklist"), icon: ListChecks, node: <TaskChecklist … /> },
 *     { id: "time", column: "side", title: tr("Time"), icon: Timer, node: <TaskTime … /> },
 *     { id: "tasks", title: tr("Linked tasks"), icon: CheckSquare, bare: true, node: <DataTable … /> },
 *   ]} />
 *
 * A card collapses through its own header (CardHeader / CardLabel show the chevron); a `bare` slot (a table, not a
 * card) gets a small title line with the chevron instead. A `fixed` slot (a page's main card, like a person's profile)
 * can be moved but neither collapsed nor hidden.
 */

const SlotContext = createContext(null);
export const useCardSlot = () => useContext(SlotContext);

/** The collapse chevron of the card it sits in; nothing outside DetailCards. */
export function CardToggle({ className }) {
  const slot = useCardSlot();
  const tr = useT();
  if (!slot) return null;
  return (
    <button
      type="button"
      onClick={slot.toggle}
      className={cn("dc-toggle grid h-7 w-7 shrink-0 place-items-center rounded-app-sm text-fg-faint transition hover:bg-surface-2 hover:text-fg", className)}
      aria-expanded={!slot.collapsed}
      aria-label={slot.collapsed ? tr("Expand") : tr("Collapse")}
      data-tip={slot.collapsed ? tr("Expand") : tr("Collapse")}
    >
      <ChevronDown size={15} className={cn("transition-transform duration-200", slot.collapsed && "-rotate-90")} />
    </button>
  );
}

/** The header button that switches a page into arrange mode. */
export function ArrangeButton({ active, onClick }) {
  const tr = useT();
  return <Button variant={active ? "subtle" : "outline"} size="icon" icon={LayoutDashboard} onClick={onClick} aria-pressed={active} aria-label={tr("Arrange cards")} data-tip={tr("Arrange cards")} className="dc-arrange-open" />;
}

const COLUMNS = ["main", "side"];

/** The saved layout laid over the cards this page has now: unknown ids dropped, new cards in their default column. */
function resolve(saved, slots) {
  const ids = new Set(slots.map((s) => s.id));
  const seen = new Set();
  const keep = (list) => (Array.isArray(list) ? list : []).filter((id) => ids.has(id) && !seen.has(id) && seen.add(id));
  const out = { main: keep(saved?.main), side: keep(saved?.side) };
  for (const s of slots) if (!seen.has(s.id)) out[s.column === "side" ? "side" : "main"].push(s.id);
  const free = new Set(slots.filter((s) => !s.fixed).map((s) => s.id));
  out.hidden = (saved?.hidden ?? []).filter((id) => free.has(id));
  out.collapsed = (saved?.collapsed ?? []).filter((id) => free.has(id));
  return out;
}
/** What gets saved: the layout, plus cards this page does not have right now (a card that only some records show) where they were. */
function withAbsent(next, saved, slots) {
  const ids = new Set(slots.map((s) => s.id));
  const out = { main: [...next.main], side: [...next.side], hidden: [...next.hidden], collapsed: [...next.collapsed] };
  for (const key of ["main", "side", "hidden", "collapsed"]) for (const id of saved?.[key] ?? []) if (!ids.has(id) && !out[key].includes(id)) out[key].push(id);
  return out;
}

export default function DetailCards({ page, slots, arranging = false, onDone, grid = "xl:grid-cols-[1fr_340px]", sideClass = "xl:sticky xl:top-0 xl:self-start", className }) {
  const saved = usePrefs((s) => s.cardLayouts?.[page]);
  const setCardLayout = usePrefs((s) => s.setCardLayout);
  const layout = resolve(saved, slots);
  const byId = Object.fromEntries(slots.map((s) => [s.id, s]));
  const save = (patch) => setCardLayout(page, withAbsent({ ...layout, ...patch }, saved, slots));
  const toggle = (id) => save({ collapsed: layout.collapsed.includes(id) ? layout.collapsed.filter((x) => x !== id) : [...layout.collapsed, id] });

  if (arranging) return <Arrange layout={layout} byId={byId} save={save} reset={() => setCardLayout(page, null)} onDone={onDone} className={className} />;

  const shown = (column) => layout[column].filter((id) => !layout.hidden.includes(id));
  const main = shown("main");
  const side = shown("side");
  const two = main.length > 0 && side.length > 0;
  const slot = (id) => <Slot key={id} slot={byId[id]} collapsed={layout.collapsed.includes(id)} toggle={toggle} />;
  return (
    <div className={cn("detail-cards grid grid-cols-1 gap-4", two && grid, className)} data-page={page}>
      {main.length ? <div className="dc-col min-w-0 space-y-4 anim-stagger">{main.map(slot)}</div> : null}
      {side.length ? <div className={cn("dc-col min-w-0 space-y-4 anim-stagger", two && sideClass)}>{side.map(slot)}</div> : null}
    </div>
  );
}

function Slot({ slot, collapsed, toggle }) {
  const id = slot.id;
  const value = useMemo(() => (slot.fixed ? null : { collapsed, toggle: () => toggle(id) }), [slot.fixed, collapsed, toggle, id]);
  const Icon = slot.icon;
  return (
    <SlotContext.Provider value={value}>
      <div className={cn("dc-slot", collapsed && "is-collapsed", slot.bare && "dc-bare")} data-card={id}>
        {slot.bare ? (
          <div className={cn("dc-head flex items-center gap-2 px-1", collapsed ? "ui-card card px-5 py-3" : "mb-2")}>
            <p className="flex min-w-0 flex-1 items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">{Icon ? <Icon size={13} /> : null}{slot.title}</p>
            <CardToggle className="-my-1.5" />
          </div>
        ) : null}
        {slot.bare && collapsed ? null : slot.node}
      </div>
    </SlotContext.Provider>
  );
}

function Arrange({ layout, byId, save, reset, onDone, className }) {
  const tr = useT();
  const [drag, setDrag] = useState(null); // the id being dragged
  const [over, setOver] = useState(null); // { column, index } where it would land

  /** Put `id` at `index` of `column`, the index counted before it is taken out of its place. */
  const moveTo = (id, column, index) => {
    const next = { main: [...layout.main], side: [...layout.side] };
    const from = next.main.includes(id) ? "main" : "side";
    const at = next[from].indexOf(id);
    next[from].splice(at, 1);
    const to = Math.max(0, Math.min(from === column && at < index ? index - 1 : index, next[column].length));
    next[column].splice(to, 0, id);
    save(next);
  };
  const toggleHidden = (id) => save({ hidden: layout.hidden.includes(id) ? layout.hidden.filter((x) => x !== id) : [...layout.hidden, id] });
  const drop = () => {
    if (drag && over) moveTo(drag, over.column, over.index);
    setDrag(null);
    setOver(null);
  };
  const overRow = (e, column, index) => {
    if (!drag) return;
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const at = e.clientY < r.top + r.height / 2 ? index : index + 1;
    if (over?.column !== column || over?.index !== at) setOver({ column, index: at });
  };
  const line = (column, index) => (drag && over?.column === column && over?.index === index ? <div className="dc-drop h-0.5 rounded-full bg-accent" /> : null);

  return (
    <div className={cn("dc-arrange space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-app border border-accent/30 bg-accent/10 px-4 py-3 text-sm">
        <LayoutDashboard size={16} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1 basis-60">{tr("Drag the cards or use the arrows, and hide the ones you do not need. Every page of this kind opens like this.")}</span>
        <Button size="sm" variant="ghost" icon={RotateCcw} onClick={reset} className="dc-reset">{tr("Back to the default")}</Button>
        <Button size="sm" icon={Check} onClick={onDone} className="dc-done">{tr("Done arranging")}</Button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {COLUMNS.map((column) => {
          const list = layout[column];
          return (
            <div
              key={column}
              className={cn("dc-arrange-col min-h-28 space-y-1.5 rounded-app border border-dashed border-line p-2", drag && "border-accent/50")}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                if (over?.column !== column || over?.index !== list.length) setOver({ column, index: list.length });
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop();
              }}
            >
              <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-fg-faint">{column === "main" ? tr("Main column") : tr("Side column")}</p>
              {list.map((id, index) => {
                const s = byId[id];
                const Icon = s.icon;
                const hidden = layout.hidden.includes(id);
                return (
                  <div key={id}>
                    {line(column, index)}
                    <div
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", id);
                        setDrag(id);
                      }}
                      onDragEnd={() => {
                        setDrag(null);
                        setOver(null);
                      }}
                      onDragOver={(e) => overRow(e, column, index)}
                      className={cn("dc-row ui-card card flex items-center gap-1.5 !rounded-app-sm px-2 py-1.5 text-sm", hidden && "opacity-55", drag === id && "opacity-40")}
                      data-card={id}
                    >
                      <GripVertical size={15} className="shrink-0 cursor-grab text-fg-faint" />
                      {Icon ? <Icon size={14} className="shrink-0 text-fg-muted" /> : null}
                      <span className={cn("min-w-0 flex-1 truncate font-medium", hidden && "line-through decoration-fg-faint")}>{s.title}</span>
                      {hidden ? <span className="text-[11px] text-fg-faint">{tr("Hidden")}</span> : null}
                      <Button size="iconXs" variant="ghost" icon={ArrowUp} disabled={index === 0} onClick={() => moveTo(id, column, index - 1)} aria-label={tr("Move up")} data-tip={tr("Move up")} className="dc-up" />
                      <Button size="iconXs" variant="ghost" icon={ArrowDown} disabled={index === list.length - 1} onClick={() => moveTo(id, column, index + 2)} aria-label={tr("Move down")} data-tip={tr("Move down")} className="dc-down" />
                      <Button size="iconXs" variant="ghost" icon={column === "main" ? ArrowRight : ArrowLeft} onClick={() => moveTo(id, column === "main" ? "side" : "main", layout[column === "main" ? "side" : "main"].length)} aria-label={column === "main" ? tr("Move to the side column") : tr("Move to the main column")} data-tip={column === "main" ? tr("Move to the side column") : tr("Move to the main column")} className="dc-switch" />
                      {s.fixed ? <span className="h-7 w-7" /> : <Button size="iconXs" variant="ghost" icon={hidden ? EyeOff : Eye} onClick={() => toggleHidden(id)} aria-label={hidden ? tr("Show this card") : tr("Hide this card")} data-tip={hidden ? tr("Show this card") : tr("Hide this card")} className="dc-hide" />}
                    </div>
                  </div>
                );
              })}
              {line(column, list.length)}
              {!list.length ? <p className="px-1 py-3 text-center text-xs text-fg-faint">{tr("Drop a card here, or use the arrow on a card in the other column.")}</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
