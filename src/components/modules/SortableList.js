"use client";
import { useState } from "react";
import { GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Reorderable list: drag by the handle, use the arrows, or type a position
 * number. Calls onReorder(idsInNewOrder) and (optionally) onSetPosition(id, pos).
 */
export default function SortableList({ items, getId = (i) => i.id, renderItem, onReorder, onSetPosition, disabled = false, className, itemClassName }) {
  const [dragId, setDragId] = useState(null);
  const [armed, setArmed] = useState(null);
  const [over, setOver] = useState(null); // { id, before }

  const ids = items.map(getId);

  const move = (from, to) => {
    if (from === to || to < 0 || to >= ids.length) return;
    const next = [...ids];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onReorder?.(next);
  };

  const onDrop = (e, targetId) => {
    e.preventDefault();
    if (dragId == null || dragId === targetId) return reset();
    const from = ids.indexOf(dragId);
    let to = ids.indexOf(targetId);
    if (over?.before === false) to += 1;
    if (from < to) to -= 1;
    move(from, to);
    reset();
  };
  const reset = () => {
    setDragId(null);
    setOver(null);
    setArmed(null);
  };

  return (
    <ul className={cn("space-y-2", className)}>
      {items.map((item, index) => {
        const id = getId(item);
        const isDragging = dragId === id;
        const isOver = over?.id === id && dragId !== id;
        return (
          <li
            key={id}
            draggable={!disabled && armed === id}
            onDragStart={(e) => {
              setDragId(id);
              e.dataTransfer.effectAllowed = "move";
              try { e.dataTransfer.setData("text/plain", String(id)); } catch {}
            }}
            onDragOver={(e) => {
              if (dragId == null) return;
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              setOver({ id, before: e.clientY < r.top + r.height / 2 });
            }}
            onDragLeave={() => setOver((o) => (o?.id === id ? null : o))}
            onDrop={(e) => onDrop(e, id)}
            onDragEnd={reset}
            className={cn(
              "relative rounded-app border border-line bg-surface transition-all",
              isDragging && "opacity-40 scale-[0.99]",
              isOver && over.before && "shadow-[0_-3px_0_0_var(--accent)]",
              isOver && !over.before && "shadow-[0_3px_0_0_var(--accent)]",
              itemClassName
            )}
          >
            <div className="flex items-stretch">
              {/* order controls */}
              <div className="flex shrink-0 select-none flex-col items-center justify-center gap-0.5 border-r border-line px-1.5 py-2 text-fg-faint">
                <button
                  type="button"
                  disabled={disabled || index === 0}
                  onClick={() => move(index, index - 1)}
                  className="rounded p-0.5 hover:bg-surface-2 hover:text-fg disabled:opacity-30"
                  aria-label="Move up"
                >
                  <ChevronUp size={14} />
                </button>
                <span
                  className={cn("cursor-grab rounded p-0.5 hover:bg-surface-2 hover:text-fg active:cursor-grabbing", disabled && "cursor-default")}
                  onMouseDown={() => !disabled && setArmed(id)}
                  onMouseUp={() => setArmed(null)}
                  title="Drag to reorder"
                >
                  <GripVertical size={15} />
                </span>
                <button
                  type="button"
                  disabled={disabled || index === ids.length - 1}
                  onClick={() => move(index, index + 1)}
                  className="rounded p-0.5 hover:bg-surface-2 hover:text-fg disabled:opacity-30"
                  aria-label="Move down"
                >
                  <ChevronDown size={14} />
                </button>
              </div>
              <div className="flex shrink-0 items-center border-r border-line px-1">
                <PositionInput value={index + 1} max={ids.length} disabled={disabled} onCommit={(pos) => (onSetPosition ? onSetPosition(id, pos) : move(index, pos - 1))} />
              </div>
              <div className="min-w-0 flex-1">{renderItem(item, index)}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PositionInput({ value, max, onCommit, disabled }) {
  const [v, setV] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const shown = editing ? v : String(value);
  const commit = () => {
    setEditing(false);
    const n = Math.max(1, Math.min(max, parseInt(v, 10) || value));
    if (n !== value) onCommit(n);
  };
  return (
    <input
      value={shown}
      disabled={disabled}
      onFocus={() => { setV(String(value)); setEditing(true); }}
      onChange={(e) => setV(e.target.value.replace(/[^0-9]/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setEditing(false); e.currentTarget.blur(); } }}
      className="h-7 w-9 rounded-app-sm border border-transparent bg-transparent text-center font-mono text-xs font-semibold text-fg-muted transition hover:border-line focus:border-accent focus:text-fg focus:outline-none"
      title="Sort order — type a position and press Enter"
      aria-label="Sort order"
    />
  );
}
