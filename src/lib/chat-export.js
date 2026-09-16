import zlib from "node:zlib";
import { query } from "./db";
import { readStoredFile } from "./uploads";
import { HttpError } from "./http-error";
import { MESSAGE_SELECT, MESSAGE_FROM, withExtras } from "./chat";

/* ---------- a minimal streaming ZIP writer (stored entries, UTF-8 names): no dependency, one file in memory at a time ---------- */
let crcTable = null;
function crc32Fallback(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}
const crc32 = typeof zlib.crc32 === "function" ? (buf) => zlib.crc32(buf) >>> 0 : crc32Fallback;
function dosTime(d) {
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2);
  const date = ((Math.max(1980, d.getUTCFullYear()) - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  return { time, date };
}
/** entries: async iterable of { name, data: Buffer | () => Promise<Buffer|null>, mtime? } → yields the ZIP bytes. */
async function* zipStream(entries) {
  let offset = 0;
  const central = [];
  for await (const e of entries) {
    const data = typeof e.data === "function" ? await e.data() : e.data;
    if (!data) continue;
    const name = Buffer.from(e.name, "utf8");
    const crc = crc32(data);
    const { time, date } = dosTime(e.mtime ?? new Date());
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    central.push({ name, crc, size: data.length, offset, time, date });
    yield local;
    yield name;
    yield data;
    offset += 30 + name.length + data.length;
  }
  let cdSize = 0;
  for (const c of central) {
    const h = Buffer.alloc(46);
    h.writeUInt32LE(0x02014b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(20, 6);
    h.writeUInt16LE(0x0800, 8);
    h.writeUInt16LE(0, 10);
    h.writeUInt16LE(c.time, 12);
    h.writeUInt16LE(c.date, 14);
    h.writeUInt32LE(c.crc, 16);
    h.writeUInt32LE(c.size, 20);
    h.writeUInt32LE(c.size, 24);
    h.writeUInt16LE(c.name.length, 28);
    h.writeUInt16LE(0, 30);
    h.writeUInt16LE(0, 32);
    h.writeUInt16LE(0, 34);
    h.writeUInt16LE(0, 36);
    h.writeUInt32LE(0, 38);
    h.writeUInt32LE(c.offset, 42);
    yield h;
    yield c.name;
    cdSize += 46 + c.name.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(cdSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  yield end;
}

/* ---------- transcript ---------- */
const pad = (n) => String(n).padStart(2, "0");
const stamp = (iso) => {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
const retentionLabel = (days) => (days == null ? "off" : days === 1 ? "24 hours" : days === 365 ? "1 year" : `${days} days`);
/** English text for a system line (mirrors the client's systemText). */
export function systemLineText(m) {
  let ev = {};
  try {
    ev = JSON.parse(m.body);
  } catch {}
  const name = m.sender_name || "Someone";
  const names = (ev.names ?? []).join(", ");
  switch (ev.event) {
    case "created": return `${name} created the group`;
    case "added": return `${name} added ${names}`;
    case "removed": return `${name} removed ${names}`;
    case "left": return `${name} left the group`;
    case "renamed": return `${name} renamed the group to “${ev.title ?? ""}”`;
    case "owner": return `${names} is now the group owner`;
    case "transferred": return `${name} handed the group over to ${names}`;
    case "admin": return `${name} made ${names} an admin`;
    case "unadmin": return `${name} removed ${names} as admin`;
    case "joined": return `${name} joined using the invite link`;
    case "invite_on": return `${name} turned on the invite link`;
    case "invite_reset": return `${name} reset the invite link`;
    case "invite_off": return `${name} turned off the invite link`;
    case "retention": return ev.days == null ? `${name} turned off disappearing messages` : `${name} set messages to disappear after ${retentionLabel(ev.days)}`;
    case "image": return `${name} changed the group picture`;
    default: return m.body;
  }
}
const UNSAFE = /[\\/:*?"<>|\x00-\x1f]+/g;
const safeName = (s) => String(s ?? "file").replace(UNSAFE, "_").slice(0, 120) || "file";
const slug = (s) => String(s ?? "chat").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "chat";

const fileEntryName = (m, a) => `files/${m.id}-${a.id}-${safeName(a.name)}`;

function transcriptOf(convo, members, messages, by, withFiles) {
  const lines = [];
  const kind = convo.kind === "group" ? `group, ${members.length} members` : "direct chat";
  lines.push(`Chat export — ${convo.name} (${kind})`);
  lines.push(`Exported ${stamp(new Date().toISOString())} UTC by ${by?.name ?? "an administrator"}; ${messages.length} messages; times are UTC`);
  lines.push(`Members: ${members.map((m) => `${m.name}${m.role && m.role !== "member" ? ` (${m.role})` : ""}`).join(", ")}`);
  lines.push("");
  for (const m of messages) {
    const at = stamp(m.created_at);
    if (m.kind === "system") {
      lines.push(`[${at}] — ${systemLineText(m)}`);
      continue;
    }
    const who = m.sender_name ?? "Deleted account";
    if (m.deleted_at) {
      lines.push(`[${at}] ${who}: (message deleted)`);
      continue;
    }
    if (m.kind === "sticker") {
      lines.push(`[${at}] ${who}: [sticker: ${m.body}]`);
      continue;
    }
    if (m.kind === "call") {
      let c = {};
      try { c = JSON.parse(m.body); } catch {}
      const dur = c.duration ? ` ${Math.floor(c.duration / 60)}:${String(c.duration % 60).padStart(2, "0")}` : "";
      lines.push(`[${at}] ${who}: [${c.kind === "video" ? "video" : "voice"} call: ${c.status}${dur}]`);
      continue;
    }
    if (m.kind === "location") {
      let loc = {};
      try { loc = JSON.parse(m.body); } catch {}
      lines.push(`[${at}] ${who}: [location: ${loc.lat}, ${loc.lng}${loc.accuracy ? ` ±${loc.accuracy} m` : ""} — https://www.google.com/maps?q=${loc.lat},${loc.lng}]`);
      continue;
    }
    const parts = [];
    if (m.reply_to) {
      const quoted = m.reply_to.deleted ? "(deleted)" : (m.reply_to.body || (m.reply_to.attachment ? `[${m.reply_to.attachment.kind}]` : "")).replace(/\s+/g, " ").slice(0, 80);
      parts.push(`↩ ${m.reply_to.sender_name ?? "?"}: ${quoted}`);
    }
    if (m.forwarded) parts.push("(forwarded)");
    if (m.body) parts.push(m.body);
    for (const a of m.attachments ?? []) {
      const tag = a.kind === "image" ? "photo" : a.kind === "audio" ? "voice message" : a.kind === "video" ? "video" : "file";
      parts.push(`[${tag}: ${a.name ?? ""}${withFiles ? ` → ${fileEntryName(m, a)}` : ""}]`);
    }
    if (m.edited_at) parts.push("(edited)");
    const text = parts.join(" ").split("\n");
    lines.push(`[${at}] ${who}: ${text[0]}`);
    for (const extra of text.slice(1)) lines.push(`    ${extra}`);
    if (m.reactions?.length) lines.push(`    reactions: ${m.reactions.map((r) => `${r.emoji} ${r.names.join(", ")}`).join(" · ")}`);
  }
  return lines.join("\n") + "\n";
}
function jsonOf(convo, members, messages, by, withFiles) {
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      exported_by: by ? { id: by.id, name: by.name } : null,
      conversation: { id: convo.id, kind: convo.kind, title: convo.kind === "group" ? convo.title : null, name: convo.name, retention_days: convo.retention_days ?? null, created_at: convo.created_at ?? null },
      members: members.map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role })),
      messages: messages.map((m) => ({
        id: m.id,
        kind: m.kind,
        sender_id: m.sender_id,
        sender_name: m.sender_name,
        body: m.kind === "system" ? systemLineText(m) : m.body,
        location: m.kind === "location" ? (() => { try { return JSON.parse(m.body); } catch { return null; } })() : undefined,
        created_at: m.created_at,
        edited_at: m.edited_at,
        deleted_at: m.deleted_at,
        reply_to_id: m.reply_to_id,
        forwarded: m.forwarded,
        mentions: m.mentions,
        reactions: m.reactions,
        attachments: (m.attachments ?? []).map((a) => ({ id: a.id, kind: a.kind, name: a.name, mime: a.mime, size: a.size, width: a.width, height: a.height, duration: a.duration, ...(withFiles ? { file: fileEntryName(m, a) } : {}) })),
      })),
    },
    null,
    2
  );
}

/** Every message of a conversation above `floor`, oldest first, with attachments, reactions and quotes. */
async function allMessages(conversationId, floor) {
  const rows = await query(`SELECT ${MESSAGE_SELECT} FROM ${MESSAGE_FROM} WHERE x.conversation_id = ? AND x.id > ? ORDER BY x.id ASC`, [conversationId, floor]);
  return withExtras(rows);
}

/**
 * A download of one conversation: "txt" (transcript), "json", or "zip" (both plus every photo, voice note and file).
 * `convo` is a shaped conversation (members[] with roles); `floor` hides messages up to an id (delete-on-my-side).
 */
export async function exportConversation(convo, { format, floor = 0, by = null } = {}) {
  const fmt = ["txt", "json", "zip"].includes(format) ? format : "txt";
  const messages = await allMessages(convo.id, floor);
  const members = convo.members ?? [];
  const date = new Date().toISOString().slice(0, 10);
  const base = `chat-${slug(convo.name)}-${date}`;
  const disposition = (name) => `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`;
  if (fmt === "txt") {
    return new Response(transcriptOf(convo, members, messages, by, false), { headers: { "content-type": "text/plain; charset=utf-8", "content-disposition": disposition(`${base}.txt`), "cache-control": "no-store" } });
  }
  if (fmt === "json") {
    return new Response(jsonOf(convo, members, messages, by, false), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": disposition(`${base}.json`), "cache-control": "no-store" } });
  }
  const attachments = await query(
    "SELECT a.id, a.message_id, a.stored_name, a.original_name FROM message_attachments a JOIN messages x ON x.id = a.message_id WHERE x.conversation_id = ? AND x.id > ? ORDER BY x.id, a.sort_order, a.id",
    [convo.id, floor]
  );
  const now = new Date();
  async function* entries() {
    yield { name: "transcript.txt", data: Buffer.from(transcriptOf(convo, members, messages, by, true), "utf8"), mtime: now };
    yield { name: "messages.json", data: Buffer.from(jsonOf(convo, members, messages, by, true), "utf8"), mtime: now };
    for (const a of attachments) {
      const m = messages.find((x) => x.id === a.message_id);
      yield { name: fileEntryName({ id: a.message_id }, { id: a.id, name: a.original_name }), data: () => readStoredFile(a.stored_name).catch(() => null), mtime: m ? new Date(m.created_at) : now };
    }
  }
  if (typeof ReadableStream.from !== "function") throw new HttpError("ZIP export needs Node 20.6 or newer.", 500);
  return new Response(ReadableStream.from(zipStream(entries())), { headers: { "content-type": "application/zip", "content-disposition": disposition(`${base}.zip`), "cache-control": "no-store" } });
}
