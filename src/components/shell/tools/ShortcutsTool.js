"use client";
import { Kbd } from "@/components/ui/Misc";

const GROUPS = [
  { title: "Navigation", items: [["⌘", "K", "Search everything"], ["⌘", "B", "Toggle sidebar"], ["⌘", ",", "Open preferences"], ["⌘", "J", "Sticky notes"], ["⌘⇧", "L", "Lock screen"]] },
  { title: "Pages", items: [["P", null, "Pin / unpin current page"], ["N", null, "New record (on list pages)"], ["Esc", null, "Close dialog / panel"], ["?", null, "This cheat-sheet"]] },
  { title: "Search", items: [["↑", "↓", "Move selection"], ["↵", null, "Open result"]] },
];

export default function ShortcutsTool({ wide = false }) {
  return (
    <div className={wide ? "mx-auto grid w-full max-w-4xl gap-6 p-6 md:grid-cols-2" : "space-y-4 p-4"}>
      {GROUPS.map((g) => (
        <div key={g.title}>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-faint">{g.title}</p>
          <ul className="divide-y divide-line rounded-app border border-line">
            {g.items.map(([a, b, label]) => (
              <li key={label} className="flex items-center justify-between px-3 py-2 text-xs">
                <span className="text-fg">{label}</span>
                <span className="flex items-center gap-1">
                  <Kbd>{a}</Kbd>
                  {b ? <Kbd>{b}</Kbd> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
