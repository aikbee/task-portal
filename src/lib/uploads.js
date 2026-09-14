import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export function uploadDir() {
  // turbopackIgnore: the directory is runtime-configurable; do not trace the whole project into the build
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.UPLOAD_DIR || "uploads");
}

export function safeStoredName(originalName = "file") {
  const ext = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 12);
  const base = path
    .basename(originalName, path.extname(originalName))
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "file";
  return `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}-${base}${ext}`;
}

/** Persist a Web File object to the upload dir; returns { storedName, size }. */
export async function saveFile(file) {
  return saveBuffer(Buffer.from(await file.arrayBuffer()), file.name);
}

/** Persist bytes already in memory under a safe generated name; returns { storedName, size }. */
export async function saveBuffer(buf, originalName) {
  const dir = uploadDir();
  await fs.mkdir(dir, { recursive: true });
  const storedName = safeStoredName(originalName);
  await fs.writeFile(path.join(/* turbopackIgnore: true */ dir, storedName), buf);
  return { storedName, size: buf.length };
}

export async function readStoredFile(storedName) {
  const file = path.join(/* turbopackIgnore: true */ uploadDir(), path.basename(storedName));
  return fs.readFile(file);
}

export async function deleteStoredFile(storedName) {
  const file = path.join(/* turbopackIgnore: true */ uploadDir(), path.basename(storedName));
  await fs.rm(file, { force: true });
}
