"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { UploadCloud, FileText, Image as ImageIcon, FileArchive, FileCode2, File as FileIcon, Download, ExternalLink, Trash2, Pencil, Check, X, Paperclip, ClipboardPaste } from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatBytes, formatDateTime } from "@/lib/utils";
import Button from "@/components/ui/Button";
import Card, { CardHeader } from "@/components/ui/Card";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import SortableList from "./SortableList";
import { useT } from "@/lib/i18n";

const EXT_BY_MIME = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "image/bmp": "bmp", "image/tiff": "tiff", "text/plain": "txt", "application/pdf": "pdf" };

/** Clipboard files arrive as "image.png" / "blob"; give them a timestamped name so they are distinguishable. */
function niceClipboardFile(file) {
  const generic = !file.name || /^(image|blob|file)(\.[a-z0-9]+)?$/i.test(file.name);
  if (!generic) return file;
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const ext = EXT_BY_MIME[file.type] || (file.name.includes(".") ? file.name.split(".").pop() : "bin");
  return new File([file], `pasted-${stamp}.${ext}`, { type: file.type, lastModified: Date.now() });
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const PASTE_KEY = isMac ? "⌘V" : "Ctrl+V";

const ICONS = { image: ImageIcon, archive: FileArchive, code: FileCode2, text: FileText, file: FileIcon };
function iconKind(mime = "", name = "") {
  if (mime.startsWith("image/")) return "image";
  if (/zip|tar|gzip|rar|7z/.test(mime) || /\.(zip|tar|gz|rar|7z)$/i.test(name)) return "archive";
  if (/json|xml|yaml|javascript|html|css|x-sh/.test(mime) || /\.(js|ts|json|xml|ya?ml|html?|css|sh|py|sql|md)$/i.test(name)) return "code";
  if (mime.startsWith("text/") || /pdf|word|document/.test(mime)) return "text";
  return "file";
}

const API_BASE = { task: "/api/tasks", requirement: "/api/requirements", info: "/api/info" };

/** Attachments for a task or a requirement (kind). Upload, drag-drop, paste, rename, reorder, delete. */
export default function AttachmentsPanel({ kind = "task", parentId, attachments, onChange }) {
  const tr = useT();
  const taskId = parentId; // parent id (kept name for the upload path below)
  const base = API_BASE[kind] ?? API_BASE.task;
  const itemUrl = (id) => `/api/attachments/${kind}/${id}`;
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const inputRef = useRef(null);
  const toast = useToast();

  const upload = async (files, { source = "files" } = {}) => {
    const list = Array.from(files || []).filter((f) => f.size > 0);
    if (!list.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      list.forEach((f) => fd.append("files", f));
      const next = await api.upload(`${base}/${taskId}/attachments`, fd);
      onChange(next);
      toast.success(
        source === "clipboard"
          ? `Pasted ${list.length > 1 ? `${list.length} files` : list[0].type.startsWith("image/") ? "image" : "file"} attached`
          : `${list.length} file${list.length > 1 ? "s" : ""} uploaded`,
        list.map((f) => f.name).join(", ")
      );
    } catch (e) {
      toast.error("Upload failed", e.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  // ⌘V / Ctrl+V anywhere on the page: files in the clipboard (screenshots, copied images) become attachments.
  const onPaste = useEffectEvent((e) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const files = items.filter((it) => it.kind === "file").map((it) => it.getAsFile()).filter(Boolean);
    if (!files.length) return; // plain-text pastes into inputs keep working
    e.preventDefault();
    upload(files.map(niceClipboardFile), { source: "clipboard" });
  });
  useEffect(() => {
    const handler = (e) => onPaste(e);
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, []);

  /** Explicit button: reads images from the clipboard (asks for permission where required). */
  const pasteFromClipboard = async () => {
    if (!navigator.clipboard?.read) return toast.info(`Press ${PASTE_KEY} anywhere on this page to paste an image`);
    try {
      const items = await navigator.clipboard.read();
      const files = [];
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/")) || item.types.find((t) => t === "application/pdf");
        if (!type) continue;
        const blob = await item.getType(type);
        files.push(niceClipboardFile(new File([blob], "image", { type })));
      }
      if (!files.length) return toast.info("No image in the clipboard", "Copy a screenshot or image first, then try again.");
      await upload(files, { source: "clipboard" });
    } catch {
      toast.error("Clipboard access was not granted", `Use ${PASTE_KEY} on this page instead.`);
    }
  };

  const reorder = async (ids) => {
    const map = Object.fromEntries(attachments.map((a) => [a.id, a]));
    onChange(ids.map((id, i) => ({ ...map[id], sort_order: i + 1 })));
    try {
      onChange(await api.put(`${base}/${taskId}/attachments`, { order: ids }));
    } catch (e) {
      toast.error("Could not save order", e.message);
    }
  };
  const setPosition = async (id, position) => {
    try {
      onChange(await api.patch(itemUrl(id), { position }));
    } catch (e) {
      toast.error("Could not move attachment", e.message);
    }
  };
  const rename = async (id, original_name) => {
    try {
      onChange(await api.patch(itemUrl(id), { original_name }));
      toast.success("Renamed");
    } catch (e) {
      toast.error("Could not rename", e.message);
    }
  };
  const remove = async () => {
    setBusyDelete(true);
    try {
      onChange(await api.del(itemUrl(toDelete.id)));
      toast.success("Attachment deleted");
      setToDelete(null);
    } catch (e) {
      toast.error("Could not delete", e.message);
    } finally {
      setBusyDelete(false);
    }
  };

  return (
    <Card>
      <CardHeader
        icon={Paperclip}
        title={tr("Attachments")}
        description={`${attachments.length} file${attachments.length === 1 ? "" : "s"} · drag, use arrows or type a number to set the order`}
        actions={
          <>
            <Button size="sm" variant="outline" icon={ClipboardPaste} disabled={uploading} onClick={pasteFromClipboard} data-tip={`Paste image from clipboard (${PASTE_KEY})`}>
              {tr("Paste")}
            </Button>
            <Button size="sm" icon={UploadCloud} loading={uploading} onClick={() => inputRef.current?.click()}>
              {tr("Upload")}
            </Button>
          </>
        }
      />
      <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "mb-4 flex cursor-pointer flex-col items-center justify-center rounded-app border-2 border-dashed px-4 py-6 text-center transition",
          dragOver ? "border-accent bg-accent/8" : "border-line hover:border-line-strong hover:bg-surface-2"
        )}
      >
        <UploadCloud size={22} className={cn("mb-1.5", dragOver ? "text-accent" : "text-fg-faint")} />
        <p className="text-sm font-medium">
          Drop files here, click to browse, or paste with <kbd className="rounded border border-line bg-surface px-1 font-mono text-[11px]">{PASTE_KEY}</kbd>
        </p>
        <p className="text-xs text-fg-muted">Screenshots and copied images upload straight from the clipboard · multiple files · up to 50 MB each</p>
      </div>

      {attachments.length === 0 ? null : (
        <SortableList
          items={attachments}
          onReorder={reorder}
          onSetPosition={setPosition}
          renderItem={(a) => <AttachmentRow att={a} url={itemUrl(a.id)} onRename={(n) => rename(a.id, n)} onDelete={() => setToDelete(a)} />}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        loading={busyDelete}
        title="Delete attachment?"
        description={toDelete ? `"${toDelete.original_name}" will be permanently removed from disk.` : ""}
      />
    </Card>
  );
}

function AttachmentRow({ att, url, onRename, onDelete }) {
  const tr = useT();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(att.original_name);
  const Icon = ICONS[iconKind(att.mime_type || "", att.original_name)];
  const isImage = (att.mime_type || "").startsWith("image/");

  const commit = () => {
    setEditing(false);
    const n = name.trim();
    if (n && n !== att.original_name) onRename(n);
    else setName(att.original_name);
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      {isImage ? (
        <a href={url} target="_blank" rel="noreferrer" className="block h-10 w-10 shrink-0 overflow-hidden rounded-app-sm border border-line bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-full w-full object-cover" />
        </a>
      ) : (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-app-sm bg-accent/10 text-accent">
          <Icon size={18} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setName(att.original_name); setEditing(false); } }}
              className="control h-7 text-sm"
            />
            <Button variant="ghost" size="iconXs" icon={Check} onClick={commit} aria-label={tr("Save")} />
            <Button variant="ghost" size="iconXs" icon={X} onClick={() => { setName(att.original_name); setEditing(false); }} aria-label={tr("Cancel")} />
          </div>
        ) : (
          <a href={url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium hover:text-accent">{att.original_name}</a>
        )}
        <p className="truncate text-[11px] text-fg-muted">
          {formatBytes(att.size_bytes)} · {att.mime_type || "unknown type"} · {formatDateTime(att.created_at)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="iconXs" icon={Pencil} onClick={() => setEditing(true)} aria-label={tr("Rename")} data-tip={tr("Rename")} />
        <a href={url} target="_blank" rel="noreferrer"><Button variant="ghost" size="iconXs" icon={ExternalLink} aria-label={tr("Open")} data-tip={tr("Open")} /></a>
        <a href={`${url}?download=1`}><Button variant="ghost" size="iconXs" icon={Download} aria-label={tr("Download")} data-tip={tr("Download")} /></a>
        <Button variant="dangerGhost" size="iconXs" icon={Trash2} onClick={onDelete} aria-label={tr("Delete")} data-tip={tr("Delete")} />
      </div>
    </div>
  );
}
