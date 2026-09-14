/**
 * Reads the type and pixel size of an image from its first bytes, so uploads are
 * checked by content rather than by the file name or the declared MIME type.
 * Supports JPEG, PNG, GIF and WebP; returns null for anything else.
 */
export const IMAGE_MIME = { jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };

export function imageMeta(buf) {
  if (!buf || buf.length < 12) return null;
  // PNG: 8-byte signature, IHDR width/height big-endian at 16/20
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return buf.length >= 24 ? { type: "png", mime: IMAGE_MIME.png, width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) } : null;
  }
  // GIF87a / GIF89a: little-endian size at 6/8
  if (buf.toString("latin1", 0, 3) === "GIF") {
    return { type: "gif", mime: IMAGE_MIME.gif, width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  // WebP: RIFF....WEBP then a VP8 / VP8L / VP8X chunk
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") {
    if (buf.length < 30) return null;
    const chunk = buf.toString("latin1", 12, 16);
    if (chunk === "VP8 ") return { type: "webp", mime: IMAGE_MIME.webp, width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const b1 = buf[21], b2 = buf[22], b3 = buf[23], b4 = buf[24];
      return { type: "webp", mime: IMAGE_MIME.webp, width: 1 + (((b2 & 0x3f) << 8) | b1), height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | (b2 >> 6)) };
    }
    if (chunk === "VP8X") return { type: "webp", mime: IMAGE_MIME.webp, width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    return null;
  }
  // JPEG: walk the markers to the first SOFn frame header
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xff) { i++; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      const sof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
      if (sof) return { type: "jpeg", mime: IMAGE_MIME.jpeg, height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      if (marker === 0xd9 || marker === 0xda) break;
      i += 2 + len;
    }
    return { type: "jpeg", mime: IMAGE_MIME.jpeg, width: 0, height: 0 };
  }
  return null;
}
