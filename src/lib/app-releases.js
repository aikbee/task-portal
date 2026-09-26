import path from "node:path";
import fs from "node:fs";
import { Readable } from "node:stream";
import { query, queryOne, execute } from "./db";
import { HttpError } from "./http-error";
import { inspectApk } from "./apk";
import { saveBuffer, deleteStoredFile, uploadDir } from "./uploads";

/**
 * Releases of the native apps. An administrator uploads an APK; the phones ask /api/app/android/latest and update
 * themselves. The file itself says what it is (package, version, signing key), so a wrong build is refused here
 * rather than failing on a hundred phones.
 */
export const APK_MAX_BYTES = 90 * 1024 * 1024; // a release is ~20 MB; a debug build (for a test phone) three times that
/** Only our own apps: the release package and the debug / qa flavours used on a test phone against a dev server. */
const PACKAGE_RE = /^com\.systemportal\.task(\.[a-z]+)?$/;
const FIELDS = "id, platform, package_name, version_code, version_name, min_sdk, size_bytes, sha256, cert_sha256, notes, uploaded_by, created_at";

/** The row a client sees (the stored file name stays on the server). */
export function shapeRelease(r, { withUrl = true } = {}) {
  if (!r) return null;
  return {
    id: r.id, platform: r.platform, package_name: r.package_name, version_code: r.version_code, version_name: r.version_name, min_sdk: r.min_sdk,
    size_bytes: r.size_bytes, sha256: r.sha256, cert_sha256: r.cert_sha256, notes: r.notes, created_at: r.created_at, uploaded_by_name: r.uploaded_by_name ?? null,
    ...(withUrl ? { url: `/api/app/${r.platform}/download/${r.id}`, file_name: `TaskPortal-${r.version_name}.apk` } : {}),
  };
}

export const listReleases = (platform = "android") =>
  query(`SELECT ${FIELDS.split(", ").map((f) => `r.${f}`).join(", ")}, u.name AS uploaded_by_name FROM app_releases r LEFT JOIN users u ON u.id = r.uploaded_by WHERE r.platform = ? ORDER BY r.package_name, r.version_code DESC`, [platform]);

/** The newest release of one package (the app sends its own package name: the debug flavour must not be offered the release build). */
export const latestRelease = (platform, packageName) =>
  queryOne(`SELECT ${FIELDS} FROM app_releases WHERE platform = ? AND package_name = ? ORDER BY version_code DESC LIMIT 1`, [platform, packageName]);

export const releaseById = (id) => queryOne(`SELECT ${FIELDS}, stored_name FROM app_releases WHERE id = ?`, [id]);

/** Check and store an uploaded APK. */
export async function createRelease(buf, { notes = null, userId = null } = {}) {
  if (buf.length > APK_MAX_BYTES) throw new HttpError(`The app file is too large (up to ${APK_MAX_BYTES / 1024 / 1024} MB).`, 413);
  let info;
  try {
    info = inspectApk(buf);
  } catch (e) {
    throw new HttpError(e.message, 400);
  }
  if (!PACKAGE_RE.test(info.package)) throw new HttpError(`This is a different app (${info.package}), not Task Portal.`, 400);
  const current = await latestRelease("android", info.package);
  if (current && info.versionCode <= current.version_code) throw new HttpError(`Version code ${info.versionCode} is not newer than the published ${current.version_name} (code ${current.version_code}). Raise versionCode in the app and build again.`, 409);
  if (current?.cert_sha256 && info.certSha256 && current.cert_sha256 !== info.certSha256) throw new HttpError("This build is signed with a different key than the published one: phones would refuse to install it over the app they have. Use the same keystore.", 409);
  if (!info.certSha256) throw new HttpError("This build is not signed (no APK signature block). Phones cannot install it.", 400);
  const { storedName } = await saveBuffer(buf, `TaskPortal-${info.versionName}.apk`);
  const res = await execute(
    "INSERT INTO app_releases (platform, package_name, version_code, version_name, min_sdk, size_bytes, sha256, cert_sha256, stored_name, notes, uploaded_by) VALUES ('android', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [info.package, info.versionCode, info.versionName, info.minSdk ?? null, buf.length, info.sha256, info.certSha256, storedName, notes ? String(notes).replace(/\r\n?/g, "\n").trim().slice(0, 4000) || null : null, userId]
  );
  return releaseById(res.insertId);
}

export async function deleteRelease(id) {
  const r = await releaseById(id);
  if (!r) throw new HttpError("Release not found.", 404);
  await execute("DELETE FROM app_releases WHERE id = ?", [id]);
  await deleteStoredFile(r.stored_name).catch(() => {});
  return r;
}

/** The APK as a response: streamed from disk, named after its version. */
export function releaseFileResponse(r) {
  const file = path.join(/* turbopackIgnore: true */ uploadDir(), path.basename(r.stored_name));
  if (!fs.existsSync(file)) throw new HttpError("The app file is missing on the server.", 404);
  return new Response(Readable.toWeb(fs.createReadStream(file)), {
    headers: {
      "content-type": "application/vnd.android.package-archive",
      "content-length": String(r.size_bytes),
      "content-disposition": `attachment; filename="TaskPortal-${r.version_name}.apk"`,
      "cache-control": "private, max-age=0",
      "x-checksum-sha256": r.sha256,
    },
  });
}
