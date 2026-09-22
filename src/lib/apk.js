import zlib from "node:zlib";
import crypto from "node:crypto";

/**
 * Reads what an uploaded APK says about itself — package name, version code and name, SDK levels and the
 * signing certificate — straight from the file, so an administrator cannot publish the wrong build by mistake.
 * No native tools: a minimal ZIP reader, Android's binary XML for the manifest, and the APK signing block.
 */

/** One file out of a ZIP (stored or deflated); null when it is not there. */
function zipEntry(buf, wanted) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("This is not a ZIP file.");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("The ZIP directory is damaged.");
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    if (buf.toString("utf8", p + 46, p + 46 + nameLen) === wanted) {
      if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error("The ZIP entry is damaged.");
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + csize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return zlib.inflateRawSync(data);
      throw new Error("Unsupported ZIP compression.");
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** Android's binary XML string pool. */
function stringPool(buf, p) {
  const headerSize = buf.readUInt16LE(p + 2), count = buf.readUInt32LE(p + 8), flags = buf.readUInt32LE(p + 16), stringsStart = buf.readUInt32LE(p + 20);
  const utf8 = (flags & 0x100) !== 0;
  const out = [];
  for (let i = 0; i < count; i++) {
    let off = p + stringsStart + buf.readUInt32LE(p + headerSize + i * 4);
    if (utf8) {
      let chars = buf[off++]; if (chars & 0x80) chars = ((chars & 0x7f) << 8) | buf[off++];
      let bytes = buf[off++]; if (bytes & 0x80) bytes = ((bytes & 0x7f) << 8) | buf[off++];
      out.push(buf.toString("utf8", off, off + bytes));
    } else {
      let len = buf.readUInt16LE(off); off += 2;
      if (len & 0x8000) { len = ((len & 0x7fff) << 16) | buf.readUInt16LE(off); off += 2; }
      out.push(buf.toString("utf16le", off, off + len * 2));
    }
  }
  return out;
}

/** The manifest's own attributes and those of <uses-sdk>, by attribute name. */
function parseManifest(axml) {
  if (axml.length < 8 || axml.readUInt16LE(0) !== 0x0003) throw new Error("AndroidManifest.xml is not binary XML.");
  let strings = [];
  const out = {};
  let p = 8;
  while (p + 8 <= axml.length) {
    const type = axml.readUInt16LE(p), size = axml.readUInt32LE(p + 4);
    if (size < 8) break;
    if (type === 0x0001) strings = stringPool(axml, p);
    else if (type === 0x0102) {
      const name = strings[axml.readUInt32LE(p + 20)];
      if (name === "manifest" || name === "uses-sdk") {
        const attrStart = axml.readUInt16LE(p + 24), attrSize = axml.readUInt16LE(p + 26), attrCount = axml.readUInt16LE(p + 28);
        let a = p + 16 + attrStart;
        for (let i = 0; i < attrCount; i++, a += attrSize) {
          const attr = strings[axml.readUInt32LE(a + 4)], raw = axml.readUInt32LE(a + 8), dataType = axml[a + 15], data = axml.readUInt32LE(a + 16);
          const text = raw !== 0xffffffff ? strings[raw] : dataType === 0x03 ? strings[data] : null;
          if (attr === "package") out.package = text;
          else if (attr === "versionCode") out.versionCode = dataType === 0x10 ? data : Number(text) || null;
          else if (attr === "versionName") out.versionName = text;
          else if (attr === "minSdkVersion") out.minSdk = dataType === 0x10 ? data : Number(text) || null;
          else if (attr === "targetSdkVersion") out.targetSdk = dataType === 0x10 ? data : Number(text) || null;
        }
        if (name === "uses-sdk") break; // it follows <manifest>; nothing else is needed
      }
    }
    p += size;
  }
  return out;
}

/** SHA-256 of the first signing certificate (APK signature scheme v2 or v3) — what apksigner prints; null when there is no block. */
function certificateDigest(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  const cd = buf.readUInt32LE(eocd + 16);
  if (cd < 32 || buf.toString("latin1", cd - 16, cd) !== "APK Sig Block 42") return null;
  const blockSize = Number(buf.readBigUInt64LE(cd - 24));
  const start = cd - blockSize - 8;
  if (start < 0) return null;
  let p = start + 8;
  while (p + 12 <= cd - 24) {
    const len = Number(buf.readBigUInt64LE(p)), id = buf.readUInt32LE(p + 8);
    if (id === 0x7109871a || id === 0xf05368c0) {
      // signers → signer → signed data → (digests, certificates → first certificate)
      let q = p + 12; q += 4; // signers length
      q += 4; // first signer length
      q += 4; // signed data length
      const digestsLen = buf.readUInt32LE(q); q += 4 + digestsLen;
      q += 4; // certificates length
      const certLen = buf.readUInt32LE(q); q += 4;
      return crypto.createHash("sha256").update(buf.subarray(q, q + certLen)).digest("hex");
    }
    p += 8 + len;
  }
  return null;
}

/** { package, versionCode, versionName, minSdk, targetSdk, certSha256, sha256 } of an APK, or an Error that says what is wrong with the file. */
export function inspectApk(buf) {
  const manifest = zipEntry(buf, "AndroidManifest.xml");
  if (!manifest) throw new Error("This file is not an Android app: it has no AndroidManifest.xml.");
  const m = parseManifest(manifest);
  if (!m.package || !Number.isInteger(m.versionCode) || !m.versionName) throw new Error("The app's manifest has no package, version code or version name.");
  return { ...m, certSha256: certificateDigest(buf), sha256: crypto.createHash("sha256").update(buf).digest("hex") };
}
