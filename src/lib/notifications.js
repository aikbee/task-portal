import { query, queryOne, execute } from "./db";
import { NOTIFICATION_TYPES } from "./constants";
import { sendPush } from "./push";
import { sendNotificationEmail, EMAIL_TYPES } from "./mail";
import { moduleAllowed } from "./access-control";
import { publish } from "./live";

/** Types a user sees even for their own actions (milestones, reminders, security). */
const SELF_VISIBLE = new Set(["task_done", "requirement_done", "project_completed", "task_due", "task_overdue", "security_login"]);

async function recipient(userId) {
  const row = await queryOne("SELECT email, status, role, notification_prefs, module_access FROM users WHERE id = ?", [userId]);
  const prefs = typeof row?.notification_prefs === "string" ? JSON.parse(row.notification_prefs) : row?.notification_prefs;
  // email right away only in "instant" mode (the old boolean `email` still counts when no mode is stored)
  const instant = prefs?.email_mode ? prefs.email_mode === "instant" : prefs?.email !== false;
  const muted = new Set(prefs?.muted ?? []);
  if (row && !moduleAllowed(row, "chat")) muted.add("chat"); // chat is turned off for this account
  return { muted, email: row?.status === "active" && instant ? row.email : null };
}

/**
 * Create a notification for one user. Skips self-generated noise (unless the
 * type is self-visible), muted categories, and duplicates by dedupe key.
 */
export async function notify({ userId, type, title, body = null, href = null, entityType = null, entityId = null, actorId = null, dedupeKey = null, profileId = null, tag = null, email = true, push = null }) {
  if (!userId || !NOTIFICATION_TYPES[type]) return false;
  if (actorId && actorId === userId && !SELF_VISIBLE.has(type)) return false;
  const { muted, email: address } = await recipient(userId);
  if (muted.has(NOTIFICATION_TYPES[type].category)) return false;
  if (dedupeKey) {
    const exists = await queryOne("SELECT id FROM notifications WHERE user_id = ? AND dedupe_key = ?", [userId, dedupeKey]);
    if (exists) return false;
  }
  const res = await execute(
    "INSERT INTO notifications (user_id, type, title, body, href, entity_type, entity_id, profile_id, actor_id, dedupe_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [userId, type, title.slice(0, 200), body ? String(body).slice(0, 500) : null, href, entityType, entityId, profileId, actorId, dedupeKey]
  );
  // open apps hear about it at once: the bell counts up, and an app that holds the stream in the background (the
  // Android app) shows it as a phone notification. `data` is what a call push carries (ring / missed).
  publish(userId, { type: "notification", notification: { id: res.insertId, type, category: NOTIFICATION_TYPES[type].category, title: title.slice(0, 200), body: body ? String(body).slice(0, 500) : null, href: href || null, profile_id: profileId, tag: tag || dedupeKey || `n-${res.insertId}`, created_at: new Date().toISOString(), data: push?.data ?? null } });
  // devices that opted in get the same notification as a push (fire and forget)
  // `push`: { ttl, urgency, topic, data } — calls go out urgent and short-lived and carry what the banner needs
  sendPush(userId, { title: title.slice(0, 200), body: body ? String(body).slice(0, 500) : "", href: href || "/notifications", tag: tag || dedupeKey || `n-${res.insertId}`, type, ...(push?.data ?? {}) }, push ?? undefined).catch(() => {});
  // the important ones also go out by email when the portal has a mail account and the person did not opt out
  if (email && address && EMAIL_TYPES.has(type)) sendNotificationEmail({ id: res.insertId, to: address, type, title: title.slice(0, 200), body }).catch(() => {});
  return true;
}

/** Notify the owner of the workspace the acting user is in. */
export function notifyOwner(user, payload) {
  return notify({ ...payload, userId: user.owner_id, actorId: user.id, profileId: user.profile_id ?? null }).catch(() => false);
}

/**
 * Notify the people a change concerns inside the active profile: its owner, the accounts linked to the given
 * employee records (the assignee, say), and with `managers` the profile's managers. The actor is skipped by
 * notify() itself. `forAssignee` can reword the entry for the linked person ("… assigned you: …").
 */
export async function notifyInvolved(user, payload, { employeeIds = [], taskIds = [], managers = false, forAssignee = null } = {}) {
  try {
    const profileId = user.profile_id ?? null;
    const onTasks = taskIds.filter(Boolean).length ? (await query("SELECT DISTINCT employee_id FROM task_assignees WHERE task_id IN (?)", [taskIds.filter(Boolean)])).map((r) => r.employee_id) : [];
    const ids = [...employeeIds, ...onTasks].filter(Boolean);
    const linked = ids.length ? (await query("SELECT DISTINCT linked_user_id AS id FROM employees WHERE id IN (?) AND profile_id = ? AND linked_user_id IS NOT NULL", [ids, profileId])).map((r) => r.id) : [];
    const bosses = managers ? (await query("SELECT user_id AS id FROM profile_members WHERE profile_id = ? AND status = 'active' AND role = 'manager'", [profileId])).map((r) => r.id) : [];
    const recipients = new Set([user.owner_id, ...linked, ...bosses]);
    await Promise.all([...recipients].map((userId) => notify({ ...payload, ...(forAssignee && linked.includes(userId) && userId !== user.owner_id ? forAssignee : {}), userId, actorId: user.id, profileId }).catch(() => false)));
  } catch {}
}

/** Notify every active admin except the actor. */
export async function notifyAdmins(actor, payload) {
  const admins = await query("SELECT id FROM users WHERE role = 'admin' AND status = 'active' AND id <> ?", [actor?.id ?? 0]);
  await Promise.all(admins.map((a) => notify({ ...payload, userId: a.id, actorId: actor?.id ?? null }).catch(() => false)));
}

/** Generate due-soon / overdue reminders for the workspace's open tasks (idempotent via dedupe keys). */
export async function ensureReminders(userId, profileId) {
  let created = 0;
  const tasks = await query(
    `SELECT t.id, t.title, t.due_date, p.name AS project_name,
       (SELECT GROUP_CONCAT(DISTINCT e.linked_user_id) FROM task_assignees a JOIN employees e ON e.id = a.employee_id WHERE a.task_id = t.id AND e.linked_user_id IS NOT NULL) AS linked_users,
       DATEDIFF(t.due_date, CURDATE()) AS days
     FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.profile_id = ? AND t.status <> 'done' AND t.due_date IS NOT NULL AND t.due_date <= DATE_ADD(CURDATE(), INTERVAL 1 DAY)`,
    [profileId]
  );
  for (const t of tasks) {
    const overdue = t.days < 0;
    const when = overdue ? `${-t.days} day${t.days === -1 ? "" : "s"} overdue` : t.days === 0 ? "due today" : "due tomorrow";
    // the person the task is assigned to gets the same reminder when their employee record is linked to an account
    for (const linked of String(t.linked_users ?? "").split(",").map(Number).filter((n) => n && n !== userId)) {
      await notify({ userId: linked, type: overdue ? "task_overdue" : "task_due", title: `${t.title} is ${when}`, body: t.project_name || null, href: `/tasks/${t.id}`, entityType: "task", entityId: t.id, profileId, dedupeKey: `${overdue ? "overdue" : "due"}:${t.id}:${t.due_date}` }).catch(() => false);
    }
    const made = await notify({
      userId,
      type: overdue ? "task_overdue" : "task_due",
      title: `${t.title} is ${when}`,
      body: t.project_name || null,
      href: `/tasks/${t.id}`,
      entityType: "task",
      entityId: t.id,
      profileId,
      dedupeKey: `${overdue ? "overdue" : "due"}:${t.id}:${t.due_date}`,
    }).catch(() => false);
    if (made) created++;
  }
  return created;
}
