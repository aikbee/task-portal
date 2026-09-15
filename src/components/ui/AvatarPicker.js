"use client";
import { useRef } from "react";
import { Upload, Trash2, Type } from "lucide-react";
import Avatar from "./Avatar";
import Button from "./Button";
import { PRESETS, parseAvatar } from "@/lib/avatars";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const MAX_INPUT = 15 * 1024 * 1024;

/** Square-crop and downscale a picked image in the browser (256 px, JPEG; PNG keeps transparency). */
export async function prepareAvatar(file) {
  if (file.size > MAX_INPUT) throw new Error("too-large");
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  canvas.getContext("2d").drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
  bitmap.close?.();
  const png = file.type === "image/png";
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, png ? "image/png" : "image/jpeg", 0.9));
  if (!blob) throw new Error("unsupported");
  return new File([blob], `avatar.${png ? "png" : "jpg"}`, { type: blob.type });
}

/**
 * Choose a picture: upload a photo, pick a preset icon, or (for people) fall back to initials.
 * `value` is the stored avatar value; `owner` is "user" or "group" (groups have a badge instead of initials).
 */
export default function AvatarPicker({ value, color, name, owner = "user", busy = false, onPick, onUpload, onClear }) {
  const tr = useT();
  const fileRef = useRef(null);
  const current = parseAvatar(value);
  const isPerson = owner === "user";
  const fallback = isPerson ? "pro" : "group";
  return (
    <div className="avatar-picker space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={name} color={color} avatar={value} fallback={fallback} size="xl" className="h-20 w-20 text-xl" />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onUpload(f);
            }}
          />
          <Button size="sm" variant="secondary" icon={Upload} onClick={() => fileRef.current?.click()} loading={busy}>{tr("Upload photo")}</Button>
          {isPerson ? (
            <Button size="sm" variant={current.kind === "initials" ? "subtle" : "ghost"} icon={Type} onClick={() => onPick("initials")} disabled={busy || current.kind === "initials"}>{tr("Use initials")}</Button>
          ) : null}
          {current.kind === "upload" || current.kind === "preset" || (isPerson && current.kind === "initials") ? (
            <Button size="sm" variant="ghost" icon={Trash2} onClick={onClear} disabled={busy}>{isPerson ? tr("Back to default") : tr("Remove picture")}</Button>
          ) : null}
          <p className="basis-full text-[11px] text-fg-faint">{tr("Photos are cropped to a square and resized to 256 px before upload.")}</p>
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{tr("Or pick an icon")}</p>
        <div className="avatar-grid grid grid-cols-6 gap-2 sm:grid-cols-8">
          {PRESETS.map((p) => {
            const on = current.kind === "preset" ? current.key === p.key : current.kind === "default" && isPerson && p.key === "pro";
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => onPick(`preset:${p.key}`)}
                disabled={busy}
                className={cn("avatar-choice grid place-items-center rounded-full p-0.5 transition hover:scale-110 focus-ring", on && "is-on ring-2 ring-accent ring-offset-2 ring-offset-surface")}
                aria-label={tr(p.label)}
                aria-pressed={on}
                data-tip={tr(p.label)}
              >
                <Avatar name={p.label} color={color} avatar={`preset:${p.key}`} size="md" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
