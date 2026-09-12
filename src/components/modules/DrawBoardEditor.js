"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Canvas, PencilBrush, IText, Rect, Ellipse, FabricImage } from "fabric";
import { MousePointer2, PenTool, Eraser, Type, Square, Circle, ImagePlus, Undo2, Redo2, Trash2, Copy, ChevronUp, ChevronDown, ZoomIn, ZoomOut, Maximize, Download, Save } from "lucide-react";
import Button from "@/components/ui/Button";
import { DropdownMenu } from "@/components/ui/Popover";
import { useToast } from "@/components/ui/Toast";
import { usePrefs } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const COLORS = ["#111827", "#ef4444", "#f97316", "#eab308", "#22c55e", "#0ea5e9", "#6366f1", "#ec4899", "#ffffff"];
const WIDTHS = [2, 4, 8, 14];
const HISTORY_MAX = 50;
const ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3];
function ToolButton({ active, onClick, icon: Icon, label, hint }) {
  return (
    <button type="button" onClick={onClick} className={cn("grid h-9 w-9 place-items-center rounded-app-sm transition", active ? "bg-accent text-white shadow-[0_6px_14px_-6px_var(--accent)]" : "text-fg-muted hover:bg-surface-2 hover:text-fg")} aria-label={label} aria-pressed={active} data-tip={`${label} (${hint})`} data-tip-pos="bottom">
      <Icon size={17} />
    </button>
  );
}

const slug = (s) => (s || "board").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "board";

/**
 * Fabric.js canvas: pen, eraser (removes the strokes/objects you drag over), text, rectangle, ellipse,
 * images (paste, drop or upload), select/move/resize/rotate, layering, undo/redo, zoom and export.
 * Autosaves the Fabric JSON (images referenced by their attachment URL) plus a JPEG thumbnail.
 */
export default function DrawBoardEditor({ board, onSaved }) {
  const tr = useT();
  const toast = useToast();
  const autosaveSeconds = usePrefs((s) => s.autosaveSeconds);
  const wrapRef = useRef(null);
  const canvasEl = useRef(null);
  const fab = useRef(null);
  const history = useRef({ stack: [], index: -1, suppress: false, timer: null });
  const knownImages = useRef(new Set((board.attachments ?? []).map((a) => a.id)));
  const drawing = useRef(null); // shape being dragged out
  const toolRef = useRef("pen");
  const styleRef = useRef({ color: COLORS[0], width: 4, fill: false });
  const fileInput = useRef(null);

  const [tool, setToolState] = useState("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(4);
  const [fill, setFill] = useState(false);
  const [zoom, setZoomState] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hist, setHist] = useState({ undo: false, redo: false });
  const [hasSelection, setHasSelection] = useState(false);
  const [ready, setReady] = useState(false);

  const W = board.width;
  const H = board.height;

  /* ---------- helpers that read the live canvas ---------- */
  const applyZoom = (z) => {
    const c = fab.current;
    if (!c) return;
    c.setZoom(z);
    c.setDimensions({ width: Math.round(W * z), height: Math.round(H * z) });
    c.requestRenderAll();
    setZoomState(z);
  };
  const manualZoom = useRef(false); // true after Zoom in/out; auto-fit stays off until "Fit"
  const fitWidth = () => (wrapRef.current?.offsetWidth ?? W) - 8 - 16; // outer width minus padding and a scrollbar allowance
  const fitZoom = () => {
    manualZoom.current = false;
    applyZoom(Math.max(0.1, Math.min(1, fitWidth() / W)));
  };
  const zoomStep = (dir) => {
    manualZoom.current = true;
    const next = dir > 0 ? ZOOMS.find((z) => z > zoom + 0.01) ?? ZOOMS[ZOOMS.length - 1] : ZOOMS.filter((z) => z < zoom - 0.01).pop() ?? ZOOMS[0];
    applyZoom(next);
  };
  const serialize = () => JSON.stringify(fab.current.toJSON()).replaceAll(`${location.origin}/api/attachments/`, "/api/attachments/");
  const pushHistory = () => {
    const h = history.current;
    if (h.suppress || !fab.current) return;
    const json = serialize();
    if (h.stack[h.index] === json) return;
    h.stack = h.stack.slice(0, h.index + 1);
    h.stack.push(json);
    if (h.stack.length > HISTORY_MAX) h.stack.shift();
    h.index = h.stack.length - 1;
    setHist({ undo: h.index > 0, redo: false });
    setDirty(true);
  };
  const scheduleHistory = () => {
    const h = history.current;
    clearTimeout(h.timer);
    h.timer = setTimeout(pushHistory, 0);
  };
  const loadJson = async (json) => {
    const c = fab.current;
    const h = history.current;
    h.suppress = true;
    await c.loadFromJSON(json);
    c.backgroundColor = board.background;
    c.requestRenderAll();
    h.suppress = false;
  };
  const undo = async () => {
    const h = history.current;
    if (h.index <= 0) return;
    h.index -= 1;
    await loadJson(h.stack[h.index]);
    setHist({ undo: h.index > 0, redo: true });
    setDirty(true);
  };
  const redo = async () => {
    const h = history.current;
    if (h.index >= h.stack.length - 1) return;
    h.index += 1;
    await loadJson(h.stack[h.index]);
    setHist({ undo: true, redo: h.index < h.stack.length - 1 });
    setDirty(true);
  };

  /** Render at 1:1 regardless of the on-screen zoom. */
  const withNativeScale = (fn) => {
    const c = fab.current;
    const z = c.getZoom();
    const active = c.getActiveObject();
    c.discardActiveObject();
    c.setZoom(1);
    c.setDimensions({ width: W, height: H });
    try {
      return fn(c);
    } finally {
      c.setZoom(z);
      c.setDimensions({ width: Math.round(W * z), height: Math.round(H * z) });
      if (active) c.setActiveObject(active);
      c.requestRenderAll();
    }
  };
  const thumbnail = () => withNativeScale((c) => c.toDataURL({ format: "jpeg", quality: 0.75, multiplier: Math.min(1, 1000 / W) }));

  const save = async () => {
    if (!fab.current || saving) return;
    setSaving(true);
    try {
      const row = await fetch(`/api/drawboards/${board.id}?light=1`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: serialize(), thumbnail: thumbnail() }) }).then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Save failed");
        return j.data;
      });
      onSaved?.(row);
      setDirty(false);
    } catch (e) {
      toast.error("Could not save the board", e.message);
    } finally {
      setSaving(false);
    }
  };
  const autosave = useEffectEvent(() => save());
  useEffect(() => {
    if (!dirty || saving || !autosaveSeconds) return;
    const t = setTimeout(() => autosave(), autosaveSeconds * 1000);
    return () => clearTimeout(t);
  }, [dirty, saving, autosaveSeconds]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  /* ---------- images ---------- */
  const addImage = async (url, at) => {
    const c = fab.current;
    const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });
    const scale = Math.min(1, (W * 0.6) / img.width, (H * 0.6) / img.height);
    img.set({ scaleX: scale, scaleY: scale });
    const left = at ? at.x - (img.width * scale) / 2 : (W - img.width * scale) / 2;
    const top = at ? at.y - (img.height * scale) / 2 : (H - img.height * scale) / 2;
    img.set({ left: Math.max(0, left), top: Math.max(0, top) });
    c.add(img);
    c.setActiveObject(img);
    c.requestRenderAll();
    setTool("select");
  };
  const uploadImages = async (files, at) => {
    const list = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    const fd = new FormData();
    list.forEach((f, i) => fd.append("files", f, f.name && f.name !== "image.png" ? f.name : `pasted-${Date.now()}-${i + 1}.${(f.type.split("/")[1] || "png").replace("jpeg", "jpg")}`));
    try {
      const r = await fetch(`/api/drawboards/${board.id}/attachments`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Upload failed");
      const fresh = (j.data ?? []).filter((a) => !knownImages.current.has(a.id));
      fresh.forEach((a) => knownImages.current.add(a.id));
      for (const a of fresh) await addImage(`/api/attachments/drawboard/${a.id}`, at);
      toast.success(tr(fresh.length === 1 ? "Image added" : "{n} images added", { n: fresh.length }));
    } catch (e) {
      toast.error("Could not add the image", e.message);
    }
  };

  /* ---------- tool state (refs keep the canvas handlers stable) ---------- */
  const setTool = (t) => {
    toolRef.current = t;
    setToolState(t);
    const c = fab.current;
    if (!c) return;
    c.isDrawingMode = t === "pen";
    c.selection = t === "select";
    c.defaultCursor = t === "select" ? "default" : t === "text" ? "text" : t === "eraser" ? "cell" : "crosshair";
    c.hoverCursor = t === "select" ? "move" : c.defaultCursor;
    c.forEachObject((o) => { o.selectable = t === "select"; o.evented = t === "select" || t === "eraser"; });
    if (t !== "select") c.discardActiveObject();
    c.requestRenderAll();
  };
  const applyStyle = () => {
    const c = fab.current;
    if (!c?.freeDrawingBrush) return;
    c.freeDrawingBrush.color = styleRef.current.color;
    c.freeDrawingBrush.width = styleRef.current.width;
  };
  const pickColor = (v) => { styleRef.current.color = v; setColor(v); applyStyle(); const c = fab.current; const objs = c?.getActiveObjects() ?? []; if (objs.length) { objs.forEach((o) => (o.type === "i-text" ? o.set({ fill: v }) : o.set({ stroke: v }))); c.requestRenderAll(); scheduleHistory(); } };
  const pickWidth = (v) => { styleRef.current.width = v; setWidth(v); applyStyle(); };
  const toggleFill = () => { styleRef.current.fill = !styleRef.current.fill; setFill(styleRef.current.fill); };

  /* ---------- selection actions ---------- */
  const deleteSelection = () => {
    const c = fab.current;
    const objs = c.getActiveObjects();
    if (!objs.length) return;
    c.discardActiveObject();
    objs.forEach((o) => c.remove(o));
    c.requestRenderAll();
  };
  const duplicateSelection = async () => {
    const c = fab.current;
    const obj = c.getActiveObject();
    if (!obj) return;
    const clone = await obj.clone();
    clone.set({ left: obj.left + 24, top: obj.top + 24 });
    c.add(clone);
    c.setActiveObject(clone);
    c.requestRenderAll();
  };
  const layer = (dir) => {
    const c = fab.current;
    const objs = c.getActiveObjects();
    objs.forEach((o) => (dir > 0 ? c.bringObjectForward(o) : c.sendObjectBackwards(o)));
    c.requestRenderAll();
    scheduleHistory();
  };

  /* ---------- export ---------- */
  const download = (blobOrUrl, name) => {
    const a = document.createElement("a");
    a.href = typeof blobOrUrl === "string" ? blobOrUrl : URL.createObjectURL(blobOrUrl);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (typeof blobOrUrl !== "string") setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const exportAs = (format) => {
    const name = slug(board.title);
    if (format === "svg") {
      const svg = withNativeScale((c) => c.toSVG());
      download(new Blob([svg], { type: "image/svg+xml" }), `${name}.svg`);
      return;
    }
    const url = withNativeScale((c) => c.toDataURL({ format, quality: format === "jpeg" ? 0.92 : undefined, multiplier: 1 }));
    download(url, `${name}.${format === "jpeg" ? "jpg" : format}`);
  };

  /* ---------- mount ---------- */
  useEffect(() => {
    const hist = history.current;
    const c = new Canvas(canvasEl.current, { width: W, height: H, backgroundColor: board.background, preserveObjectStacking: true, selection: false, stopContextMenu: true, fireRightClick: false });
    fab.current = c;
    c.freeDrawingBrush = new PencilBrush(c);
    c.freeDrawingBrush.decimate = 2;
    applyStyle();
    c.targetFindTolerance = 8;

    // shapes + text + eraser
    c.on("mouse:down", (opt) => {
      const t = toolRef.current;
      const p = c.getScenePoint(opt.e);
      if (t === "eraser") {
        if (opt.target) { c.remove(opt.target); c.requestRenderAll(); }
        return;
      }
      if (t === "text") {
        if (opt.target && opt.target.type === "i-text") return;
        const text = new IText(tr("Text"), { left: p.x, top: p.y, fontSize: Math.max(18, styleRef.current.width * 6), fill: styleRef.current.color, fontFamily: "ui-sans-serif, system-ui, sans-serif" });
        c.add(text);
        c.setActiveObject(text);
        text.enterEditing();
        text.selectAll();
        setTool("select");
        return;
      }
      if (t === "rect" || t === "ellipse") {
        const s = styleRef.current;
        const common = { left: p.x, top: p.y, stroke: s.color, strokeWidth: s.width, fill: s.fill ? `${s.color}55` : "transparent", strokeUniform: true, selectable: false, evented: false };
        const shape = t === "rect" ? new Rect({ ...common, width: 1, height: 1 }) : new Ellipse({ ...common, rx: 1, ry: 1 });
        drawing.current = { shape, x: p.x, y: p.y, kind: t };
        c.add(shape);
      }
    });
    c.on("mouse:move", (opt) => {
      const t = toolRef.current;
      if (t === "eraser") {
        if (opt.e.buttons === 1 && opt.target) { c.remove(opt.target); c.requestRenderAll(); }
        return;
      }
      const d = drawing.current;
      if (!d) return;
      const p = c.getScenePoint(opt.e);
      const w = p.x - d.x;
      const h = p.y - d.y;
      const left = Math.min(d.x, p.x);
      const top = Math.min(d.y, p.y);
      if (d.kind === "rect") d.shape.set({ left, top, width: Math.abs(w), height: Math.abs(h) });
      else d.shape.set({ left, top, rx: Math.abs(w) / 2, ry: Math.abs(h) / 2 });
      c.requestRenderAll();
    });
    c.on("mouse:up", () => {
      const d = drawing.current;
      if (!d) return;
      drawing.current = null;
      const tiny = d.kind === "rect" ? d.shape.width < 3 && d.shape.height < 3 : d.shape.rx < 2 && d.shape.ry < 2;
      if (tiny) { c.remove(d.shape); c.requestRenderAll(); return; }
      d.shape.set({ selectable: true, evented: true });
      d.shape.setCoords();
      scheduleHistory();
    });

    // history + dirty tracking
    const onChange = () => scheduleHistory();
    c.on("object:added", onChange);
    c.on("object:modified", onChange);
    c.on("object:removed", onChange);
    c.on("text:changed", onChange);
    const onSel = () => setHasSelection(c.getActiveObjects().length > 0);
    c.on("selection:created", onSel);
    c.on("selection:updated", onSel);
    c.on("selection:cleared", onSel);

    // load the saved drawing, then seed history
    (async () => {
      const h = history.current;
      h.suppress = true;
      if (board.data) {
        try { await c.loadFromJSON(board.data); } catch { /* corrupt or empty: start blank */ }
      }
      c.backgroundColor = board.background;
      c.requestRenderAll();
      h.suppress = false;
      h.stack = [serialize()];
      h.index = 0;
      setHist({ undo: false, redo: false });
      setTool("pen");
      fitZoom();
      setReady(true);
    })();

    // keyboard + paste + resize
    const isTyping = () => { const el = document.activeElement; return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable); };
    const onKey = (e) => {
      if (isTyping()) return;
      const editing = c.getActiveObject()?.isEditing;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (editing) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelection(); }
      if (e.key === "Escape") { c.discardActiveObject(); c.requestRenderAll(); }
      if (!e.metaKey && !e.ctrlKey) {
        const map = { v: "select", p: "pen", e: "eraser", t: "text", r: "rect", o: "ellipse" };
        if (map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
      }
    };
    const onPaste = (e) => {
      if (isTyping()) return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (files.length) { e.preventDefault(); uploadImages(files); return; }
      const text = e.clipboardData?.getData("text/plain");
      if (text && !c.getActiveObject()?.isEditing) {
        e.preventDefault();
        const t = new IText(text.slice(0, 2000), { left: W * 0.1, top: H * 0.1, fontSize: 24, fill: styleRef.current.color });
        c.add(t);
        c.setActiveObject(t);
        setTool("select");
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("paste", onPaste);
    // refit only when the available width changes; zooming changes the wrapper's own height
    // (the canvas grows or shrinks inside it), which must not snap the zoom back to "fit"
    let lastWidth = wrapRef.current?.offsetWidth ?? 0;
    const ro = new ResizeObserver(() => {
      const w = wrapRef.current?.offsetWidth ?? 0;
      if (w !== lastWidth) {
        lastWidth = w;
        if (!manualZoom.current) fitZoom();
      }
    });
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("paste", onPaste);
      ro.disconnect();
      clearTimeout(hist.timer);
      c.dispose();
      fab.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // size / background edited in the form
  useEffect(() => {
    const c = fab.current;
    if (!c || !ready) return;
    c.backgroundColor = board.background;
    if (!manualZoom.current) applyZoom(Math.min(1, Math.max(0.1, fitWidth() / W)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.width, board.height, board.background, ready]);

  const onDrop = (e) => {
    e.preventDefault();
    const c = fab.current;
    const rect = canvasEl.current.getBoundingClientRect();
    const z = c.getZoom();
    uploadImages(e.dataTransfer.files, { x: (e.clientX - rect.left) / z, y: (e.clientY - rect.top) / z });
  };

  const status = saving ? tr("Saving…") : dirty ? (autosaveSeconds ? `${tr("Unsaved")} · ${tr("autosaves after {n}s", { n: autosaveSeconds })}` : tr("Unsaved")) : tr("Saved");

  return (
    <div className="card overflow-hidden p-0">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2">
        <div className="flex items-center gap-0.5">
          <ToolButton active={tool === "select"} onClick={() => setTool("select")} icon={MousePointer2} label={tr("Select")} hint="V" />
          <ToolButton active={tool === "pen"} onClick={() => setTool("pen")} icon={PenTool} label={tr("Pen")} hint="P" />
          <ToolButton active={tool === "eraser"} onClick={() => setTool("eraser")} icon={Eraser} label={tr("Eraser")} hint="E" />
          <ToolButton active={tool === "text"} onClick={() => setTool("text")} icon={Type} label={tr("Text")} hint="T" />
          <ToolButton active={tool === "rect"} onClick={() => setTool("rect")} icon={Square} label={tr("Rectangle")} hint="R" />
          <ToolButton active={tool === "ellipse"} onClick={() => setTool("ellipse")} icon={Circle} label={tr("Ellipse")} hint="O" />
          <button type="button" onClick={() => fileInput.current?.click()} className="grid h-9 w-9 place-items-center rounded-app-sm text-fg-muted transition hover:bg-surface-2 hover:text-fg" aria-label={tr("Insert image")} data-tip={tr("Insert image")} data-tip-pos="bottom"><ImagePlus size={17} /></button>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { uploadImages(e.target.files); e.target.value = ""; }} />
        </div>
        <span className="hidden h-6 w-px bg-line sm:block" />
        <div className="flex items-center gap-1">
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => pickColor(c)} className={cn("h-5 w-5 rounded-full border transition hover:scale-110", color === c ? "ring-2 ring-accent ring-offset-1 ring-offset-surface" : "border-black/10")} style={{ background: c }} aria-label={c} />
          ))}
          <input type="color" value={color} onChange={(e) => pickColor(e.target.value)} className="h-6 w-7 cursor-pointer rounded border border-line bg-transparent p-0" aria-label={tr("Custom colour")} />
        </div>
        <div className="flex items-center gap-1">
          {WIDTHS.map((w) => (
            <button key={w} type="button" onClick={() => pickWidth(w)} className={cn("grid h-7 w-7 place-items-center rounded-app-sm", width === w ? "bg-surface-3" : "hover:bg-surface-2")} aria-label={`${w}px`}>
              <span className="rounded-full bg-fg" style={{ width: Math.min(18, w + 3), height: Math.min(18, w + 3) }} />
            </button>
          ))}
          {tool === "rect" || tool === "ellipse" ? <button type="button" onClick={toggleFill} className={cn("ml-1 rounded-app-sm border px-2 py-1 text-[11px]", fill ? "border-accent bg-accent/10 text-accent" : "border-line text-fg-muted")}>{tr("Fill")}</button> : null}
        </div>
        <span className="flex-1" />
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="iconSm" icon={Undo2} onClick={undo} disabled={!hist.undo} aria-label={tr("Undo")} data-tip="⌘Z" data-tip-pos="bottom" />
          <Button variant="ghost" size="iconSm" icon={Redo2} onClick={redo} disabled={!hist.redo} aria-label={tr("Redo")} data-tip="⌘⇧Z" data-tip-pos="bottom" />
          <span className="mx-1 h-6 w-px bg-line" />
          <Button variant="ghost" size="iconSm" icon={ChevronUp} onClick={() => layer(1)} disabled={!hasSelection} aria-label={tr("Bring forward")} data-tip={tr("Bring forward")} data-tip-pos="bottom" />
          <Button variant="ghost" size="iconSm" icon={ChevronDown} onClick={() => layer(-1)} disabled={!hasSelection} aria-label={tr("Send backward")} data-tip={tr("Send backward")} data-tip-pos="bottom" />
          <Button variant="ghost" size="iconSm" icon={Copy} onClick={duplicateSelection} disabled={!hasSelection} aria-label={tr("Duplicate")} data-tip={tr("Duplicate")} data-tip-pos="bottom" />
          <Button variant="dangerGhost" size="iconSm" icon={Trash2} onClick={deleteSelection} disabled={!hasSelection} aria-label={tr("Delete")} data-tip={tr("Delete")} data-tip-pos="bottom" />
          <span className="mx-1 h-6 w-px bg-line" />
          <Button variant="ghost" size="iconSm" icon={ZoomOut} onClick={() => zoomStep(-1)} aria-label={tr("Zoom out")} />
          <button type="button" onClick={fitZoom} className="min-w-[3.25rem] rounded-app-sm px-1 text-xs tabular-nums text-fg-muted hover:bg-surface-2 hover:text-fg" data-tip={tr("Fit to width")} data-tip-pos="bottom">{Math.round(zoom * 100)}%</button>
          <Button variant="ghost" size="iconSm" icon={ZoomIn} onClick={() => zoomStep(1)} aria-label={tr("Zoom in")} />
          <Button variant="ghost" size="iconSm" icon={Maximize} onClick={fitZoom} aria-label={tr("Fit to width")} />
          <span className="mx-1 h-6 w-px bg-line" />
          <DropdownMenu width="w-44" trigger={({ toggle }) => <Button variant="outline" size="sm" icon={Download} onClick={toggle}>{tr("Export")}</Button>} items={[
            { label: "PNG", onClick: () => exportAs("png") },
            { label: "JPEG", onClick: () => exportAs("jpeg") },
            { label: "WebP", onClick: () => exportAs("webp") },
            { label: "SVG", onClick: () => exportAs("svg") },
          ]} />
          <Button size="sm" variant={dirty ? "primary" : "secondary"} icon={Save} onClick={save} loading={saving} disabled={!dirty}>{tr("Save")}</Button>
        </div>
      </div>

      {/* canvas */}
      <div ref={wrapRef} onDragOver={(e) => e.preventDefault()} onDrop={onDrop} className="overflow-auto bg-[repeating-conic-gradient(var(--surface-2)_0_25%,transparent_0_50%)] bg-[length:20px_20px] p-1" style={{ maxHeight: "78vh", scrollbarGutter: "stable" }}>
        <div className="inline-block shadow-app" style={{ lineHeight: 0 }}>
          <canvas ref={canvasEl} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-1.5 text-[11px] text-fg-muted">
        <span>{W} × {H} · {tr("V select · P pen · E eraser · T text · R rectangle · O ellipse · Delete removes · ⌘Z undo · ⌘V pastes an image")}</span>
        <span className={cn(saving ? "text-accent" : dirty ? "text-amber-500" : "text-fg-faint")}>{status}</span>
      </div>
    </div>
  );
}
