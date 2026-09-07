import { query, queryOne, execute } from "./db";
import { NOTIFICATION_TYPES } from "./constants";

/** Types a user sees even for their own actions (milestones, reminders, security). */
const SELF_VISIBLE = new Set(["task_done", "requirement_done", "project_completed", "task_due", "task_overdue", "security_login"]);

async function mutedCategories(userId) {
  const row = await queryOne("SELECT notification_prefs FROM users WHERE id = ?", [userId]);
  const prefs = typeof row?.notification_prefs === "string" ? JSON.parse(row.notification_prefs) : row?.notification_prefs;
  return new Set(prefs?.muted ?? []);
}

/**
 * Create a notification for one user. Skips self-generated noise (unless the
 * type is self-visible), muted categories, and duplicates by dedupe key.
 */
export async function notify({ userId, type, title, body = null, href = null, entityType = null, entityId = null, actorId = null, dedupeKey = null, profileId = null }) {
  if (!userId || !NOTIFICATION_TYPES[type]) return false;
  if (actorId && actorId === userId && !SELF_VISIBLE.has(type)) return false;
  const muted = await mutedCategories(userId);
  if (muted.has(NOTIFICATION_TYPES[type].category)) return false;
  if (dedupeKey) {
    const exists = await queryOne("SELECT id FROM notifications WHERE user_id = ? AND dedupe_key = ?", [userId, dedupeKey]);
    if (exists) return false;
  }
  await execute(
    "INSERT INTO notifications (user_id, type, title, body, href, entity_type, entity_id, profile_id, actor_id, dedupe_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [userId, type, title.slice(0, 200), body ? String(body).slice(0, 500) : null, href, entityType, entityId, profileId, actorId, dedupeKey]
  );
  return true;
}

/** Notify the owner of the workspace the acting user is in. */
export function notifyOwner(user, payload) {
  return notify({ ...payload, userId: user.owner_id, actorId: user.id, profileId: user.profile_id ?? null }).catch(() => false);
}

/** Notify every active admin except the actor. */
export async function notifyAdmins(actor, payload) {
  const admins = await query("SELECT id FROM users WHERE role = 'admin' AND status = 'active' AND id <> ?", [actor?.id ?? 0]);
  await Promise.all(admins.map((a) => notify({ ...payload, userId: a.id, actorId: actor?.id ?? null }).catch(() => false)));
}

/** Generate due-soon / overdue reminders for the workspace's open tasks (idempotent via dedupe keys). */
export async function ensureReminders(userId, profileId) {
  const tasks = await query(
    `SELECT t.id, t.title, t.due_date, p.name AS project_name,
       DATEDIFF(t.due_date, CURDATE()) AS days
     FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.profile_id = ? AND t.status <> 'done' AND t.due_date IS NOT NULL AND t.due_date <= DATE_ADD(CURDATE(), INTERVAL 1 DAY)`,
    [profileId]
  );
  for (const t of tasks) {
    const overdue = t.days < 0;
    const when = overdue ? `${-t.days} day${t.days === -1 ? "" : "s"} overdue` : t.days === 0 ? "due today" : "due tomorrow";
    await notify({
      userId,
      type: overdue ? "task_overdue" : "task_due",
      title: `${t.title} is ${when}`,
      body: t.project_name || null,
      href: `/tasks/${t.id}`,
      entityType: "task",
      entityId: t.id,
      profileId,
      dedupeKey: `${overdue ? "overdue" : "due"}:${t.id}:${t.due_date}`,
    }).catch(() => {});
  }
}
