import { execute, query, queryOne } from "@/lib/db";
import { handler, ok, readJson, requireId, HttpError } from "@/lib/api-utils";
import { messageById, purgeMessagePhotos, publish } from "@/lib/chat";
import { notify } from "@/lib/notifications";

/**
 * Admin: act on a report — { action: "dismiss" } closes it; { action: "delete_message" } removes the message for everyone
 * (text, files and reactions go, a placeholder stays), tells the members live, notifies the sender and closes every open report on it.
 */
export const PUT = handler(
  async (request, params, user) => {
    const id = requireId(params.id);
    const report = await queryOne("SELECT * FROM message_reports WHERE id = ?", [id]);
    if (!report) throw new HttpError("Report not found.", 404);
    if (report.status !== "open") throw new HttpError("This report is already resolved.", 400);
    const action = String((await readJson(request)).action ?? "");
    if (!["dismiss", "delete_message"].includes(action)) throw new HttpError("action must be dismiss or delete_message.", 400);
    if (action === "delete_message") {
      const msg = report.message_id
        ? await queryOne("SELECT x.id, x.conversation_id, x.sender_id, x.deleted_at, c.kind, c.title FROM messages x JOIN conversations c ON c.id = x.conversation_id WHERE x.id = ?", [report.message_id])
        : null;
      if (msg && !msg.deleted_at) {
        await purgeMessagePhotos("m.id = ?", [msg.id]).catch(() => {});
        await execute("DELETE FROM message_attachments WHERE message_id = ?", [msg.id]);
        await execute("DELETE FROM message_reactions WHERE message_id = ?", [msg.id]);
        await execute("DELETE FROM message_mentions WHERE message_id = ?", [msg.id]);
        await execute("UPDATE messages SET body = '', deleted_at = NOW(), edited_at = NULL WHERE id = ?", [msg.id]);
        const message = await messageById(msg.id);
        const members = await query("SELECT user_id FROM conversation_members WHERE conversation_id = ?", [msg.conversation_id]);
        for (const m of members) publish(m.user_id, { type: "message_updated", conversation_id: msg.conversation_id, message });
        notify({
          userId: msg.sender_id,
          type: "chat_moderation",
          title: msg.kind === "group" ? `An administrator removed one of your messages in “${msg.title}” after a report` : "An administrator removed one of your messages after a report",
          body: null,
          href: `/chat?c=${msg.conversation_id}`,
          entityType: "conversation",
          entityId: msg.conversation_id,
          actorId: user.id,
        }).catch(() => {});
      }
      await execute("UPDATE message_reports SET status = 'actioned', resolved_by = ?, resolved_at = NOW() WHERE (id = ? OR (message_id = ? AND message_id IS NOT NULL)) AND status = 'open'", [user.id, id, report.message_id]);
    } else {
      await execute("UPDATE message_reports SET status = 'dismissed', resolved_by = ?, resolved_at = NOW() WHERE id = ?", [user.id, id]);
    }
    return ok(await queryOne("SELECT id, status, resolved_by, resolved_at FROM message_reports WHERE id = ?", [id]));
  },
  { role: "admin" }
);
