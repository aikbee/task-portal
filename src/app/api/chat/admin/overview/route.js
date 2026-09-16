import { query, queryOne } from "@/lib/db";
import { handler, ok } from "@/lib/api-utils";
import { readChatSettings, publicChatSettings } from "@/lib/chat";

/**
 * Moderation overview (admin): instance settings, totals, and every conversation's size, members, retention and open reports.
 * Message text is never included here — administrators only see the messages people reported.
 */
export const GET = handler(
  async () => {
    const settings = publicChatSettings(await readChatSettings());
    const totals = await queryOne(
      `SELECT
        (SELECT COUNT(*) FROM conversations) AS conversations,
        (SELECT COUNT(*) FROM conversations WHERE kind = 'group') AS group_count,
        (SELECT COUNT(*) FROM messages WHERE kind <> 'system' AND deleted_at IS NULL) AS messages,
        (SELECT COALESCE(SUM(size_bytes), 0) FROM message_attachments) AS attachment_bytes,
        (SELECT COUNT(*) FROM message_reports WHERE status = 'open') AS open_reports`
    );
    const conversations = await query(
      `SELECT c.id, c.kind, c.title, c.avatar, c.avatar_color, c.retention_days, (c.invite_code IS NOT NULL) AS has_invite, c.created_at,
        (SELECT COUNT(*) FROM conversation_members m WHERE m.conversation_id = c.id) AS member_count,
        (SELECT GROUP_CONCAT(u.name ORDER BY (m.role <> 'owner'), m.joined_at SEPARATOR ', ') FROM conversation_members m JOIN users u ON u.id = m.user_id WHERE m.conversation_id = c.id) AS member_names,
        (SELECT COUNT(*) FROM messages x WHERE x.conversation_id = c.id AND x.kind <> 'system' AND x.deleted_at IS NULL) AS message_count,
        (SELECT COALESCE(SUM(a.size_bytes), 0) FROM message_attachments a JOIN messages x ON x.id = a.message_id WHERE x.conversation_id = c.id) AS attachment_bytes,
        (SELECT MAX(x.created_at) FROM messages x WHERE x.conversation_id = c.id) AS last_at,
        (SELECT COUNT(*) FROM message_reports r WHERE r.conversation_id = c.id AND r.status = 'open') AS open_reports
       FROM conversations c ORDER BY COALESCE(last_at, c.created_at) DESC`
    );
    return ok({
      settings,
      totals: {
        conversations: Number(totals.conversations),
        groups: Number(totals.group_count),
        direct: Number(totals.conversations) - Number(totals.group_count),
        messages: Number(totals.messages),
        attachment_bytes: Number(totals.attachment_bytes),
        open_reports: Number(totals.open_reports),
      },
      conversations: conversations.map((c) => ({
        id: c.id,
        kind: c.kind,
        name: c.kind === "group" ? c.title : (c.member_names ?? "").split(", ").join(" ↔ "),
        avatar: c.avatar,
        avatar_color: c.avatar_color,
        members: c.member_names ?? "",
        member_count: Number(c.member_count),
        message_count: Number(c.message_count),
        attachment_bytes: Number(c.attachment_bytes),
        last_at: c.last_at,
        created_at: c.created_at,
        retention_days: c.retention_days,
        has_invite: Boolean(c.has_invite),
        open_reports: Number(c.open_reports),
      })),
    });
  },
  { role: "admin" }
);
