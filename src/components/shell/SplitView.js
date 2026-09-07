"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X, ArrowLeft, RefreshCw, ExternalLink, ArrowLeftRight, ChevronDown, LayoutPanelLeft } from "lucide-react";
import { usePrefs } from "@/lib/store";
import { MODULES, MODULE_MAP, moduleFromPath } from "@/lib/modules";
import { cn } from "@/lib/utils";
import { useMounted } from "@/lib/hooks";
import Button from "@/components/ui/Button";
import { DropdownMenu } from "@/components/ui/Popover";
import { useT } from "@/lib/i18n";

const MIN_PCT = 15;
const embedUrl = (path, bust) => `/embed${path === "/" ? "" : path}${bust ? `${path.includes("?") ? "&" : "?"}r=${bust}` : ""}`;

/**
 * Main content plus up to two extra panes, each showing another page of the
 * app in an iframe. Drag the dividers to resize; sizes and pane pages persist.
 */
export default function SplitView({ children }) {
  const mounted = useMounted();
  const pathname = usePathname();
  const count = usePrefs((s) => s.splitCount);
  const panes = usePrefs((s) => s.splitPanes);
  const sizes = usePrefs((s) => s.splitSizes);
  const setSplitSizes = usePrefs((s) => s.setSplitSizes);
  const n = mounted ? count : 1;
  const containerRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const startDrag = (leftIdx) => (e) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const width = el.getBoundingClientRect().width;
    const startX = e.clientX;
    const start = [...sizes];
    const total = start.slice(0, n).reduce((a, b) => a + b, 0);
    setDragging(true);
    const onMove = (ev) => {
      const delta = ((ev.clientX - startX) / width) * total;
      let a = start[leftIdx] + delta;
      let b = start[leftIdx + 1] - delta;
      const min = (MIN_PCT / 100) * total;
      if (a < min) { b -= min - a; a = min; }
      if (b < min) { a -= min - b; b = min; }
      const next = [...start];
      next[leftIdx] = a;
      next[leftIdx + 1] = b;
      setSplitSizes(next);
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div ref={containerRef} className={cn("relative flex min-h-0 flex-1", dragging && "cursor-col-resize select-none")}>
      <main className="relative min-w-0 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6" style={{ flex: `${n > 1 ? sizes[0] : 1} 1 0%` }}>
        <div key={pathname} className="mx-auto w-full max-w-[1600px] anim-fade">{children}</div>
      </main>
      {n > 1 && panes[0] ? (
        <>
          <Divider onMouseDown={startDrag(0)} />
          <Pane key={panes[0].id} index={0} pane={panes[0]} grow={sizes[1]} dragging={dragging} mainPath={pathname} />
        </>
      ) : null}
      {n > 2 && panes[1] ? (
        <>
          <Divider onMouseDown={startDrag(1)} />
          <Pane key={panes[1].id} index={1} pane={panes[1]} grow={sizes[2]} dragging={dragging} mainPath={pathname} />
        </>
      ) : null}
    </div>
  );
}

function Divider({ onMouseDown }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="group relative hidden w-1.5 shrink-0 cursor-col-resize bg-line/70 transition-colors hover:bg-accent/70 lg:block"
      role="separator"
      aria-orientation="vertical"
    >
      <span className="absolute inset-y-0 -left-1.5 -right-1.5" />
      <span className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg/20 group-hover:bg-white/80" />
    </div>
  );
}

function Pane({ index, pane, grow, dragging, mainPath }) {
  const tr = useT();
  const router = useRouter();
  const pins = usePrefs((s) => s.pins);
  const setPanePath = usePrefs((s) => s.setPanePath);
  const closePane = usePrefs((s) => s.closePane);
  const iframeRef = useRef(null);
  const [src, setSrc] = useState(() => embedUrl(pane.path));
  const [meta, setMeta] = useState({ path: pane.path, title: "" });
  const [loads, setLoads] = useState(0); // cache-buster so re-picking the same page reloads it

  // the embedded page reports its route + title on every navigation
  useEffect(() => {
    const onMessage = (e) => {
      if (e.origin !== window.location.origin || e.source !== iframeRef.current?.contentWindow) return;
      const d = e.data;
      if (d?.type !== "task-portal:pane") return;
      setMeta({ path: d.path, title: d.title });
      setPanePath(index, d.path);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [index, setPanePath]);

  const go = (path) => {
    const n = loads + 1;
    setLoads(n);
    setPanePath(index, path);
    setMeta({ path, title: "" });
    setSrc(embedUrl(path, n));
  };
  const swap = () => {
    const target = meta.path;
    go(mainPath);
    router.push(target);
  };

  const mod = moduleFromPath(meta.path);
  const Icon = mod.icon;
  const label = meta.title || (mod.key === "dashboard" ? "Dashboard" : mod.label);
  const items = [
    ...MODULES.map((m) => ({ label: m.label, icon: m.icon, onClick: () => go(m.href) })),
    pins.length ? { divider: true } : null,
    ...pins.map((p) => ({ label: p.label, icon: MODULE_MAP[p.module]?.icon, onClick: () => go(p.href) })),
    { divider: true },
    { label: "Same page as main", icon: LayoutPanelLeft, onClick: () => go(mainPath) },
  ];

  return (
    <section className={cn("hidden min-w-0 flex-col border-l border-line lg:flex", dragging && "pointer-events-none")} style={{ flex: `${grow} 1 0%` }} aria-label={`Pane ${index + 2}`}>
      <header className="flex h-9 shrink-0 items-center gap-0.5 glass border-b px-1.5 text-xs">
        <DropdownMenu
          width="w-56"
          align="start"
          items={items}
          trigger={({ toggle }) => (
            <button onClick={toggle} className="flex min-w-0 items-center gap-1.5 rounded-app-sm px-1.5 py-1 font-medium transition hover:bg-surface-2" title="Choose page">
              <span className="grid h-4 w-4 shrink-0 place-items-center rounded text-white" style={{ background: mod.color }}>
                <Icon size={10} />
              </span>
              <span className="truncate">{label}</span>
              <ChevronDown size={12} className="shrink-0 text-fg-faint" />
            </button>
          )}
        />
        <span className="hidden min-w-0 truncate font-mono text-[10px] text-fg-faint xl:inline">{meta.path}</span>
        <span className="flex-1" />
        <Button variant="ghost" size="iconXs" icon={ArrowLeft} onClick={() => iframeRef.current?.contentWindow?.history.back()} aria-label={tr("Back")} data-tip={tr("Back")} data-tip-pos="bottom" />
        <Button variant="ghost" size="iconXs" icon={RefreshCw} onClick={() => iframeRef.current?.contentWindow?.location.reload()} aria-label="Reload" data-tip="Reload" data-tip-pos="bottom" />
        <Button variant="ghost" size="iconXs" icon={ArrowLeftRight} onClick={swap} aria-label="Swap with main" data-tip="Swap with main" data-tip-pos="bottom" />
        <Button variant="ghost" size="iconXs" icon={ExternalLink} onClick={() => router.push(meta.path)} aria-label="Open in main" data-tip="Open in main" data-tip-pos="bottom" />
        <Button variant="ghost" size="iconXs" icon={X} onClick={() => closePane(index)} aria-label="Close pane" data-tip="Close pane" data-tip-pos="bottom" />
      </header>
      <iframe ref={iframeRef} src={src} title={`Pane ${index + 2}: ${label}`} className="min-h-0 w-full flex-1 bg-transparent" />
    </section>
  );
}
