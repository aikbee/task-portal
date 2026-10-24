import crypto from "node:crypto";
import { query, queryOne, execute } from "./db";
import { hashPassword } from "./password";
import { createAccount, deleteAccount } from "./accounts";
import { directConversation, ensureFriendCode } from "./chat";
import { HttpError } from "./http-error";

/**
 * The account Apple's App Review signs in with. An administrator makes it on the Mobile app page: an ordinary user,
 * "App Review", with a small workspace that looks like real work (three projects, five people of whom one is the
 * reviewer, a dozen tasks with checklists and comments, several assigned to the reviewer so My tasks and the bell are
 * not empty) and a friend, "Sam Lee" (a second account nobody signs in with), who already wrote, so chat, reporting
 * and blocking can be tried. Both get every module and no notification emails. The password is shown once; a new one
 * can be made; removing the account deletes both with everything in them. Their ids live in app_settings.app_review.
 */
const KEY = "app_review";
export const REVIEW_DEFAULT_EMAIL = "appreview@example.com";
const FRIEND = { color: "#0ea5e9" };
/** The friend's address follows the reviewer's: appreview@example.com → appreview.friend@example.com. */
const friendEmail = (address) => address.replace(/@/, ".friend@");
const QUIET = JSON.stringify({ muted: [], email: false, email_mode: "off" });
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

async function readState() {
  const row = await queryOne("SELECT value FROM app_settings WHERE name = ?", [KEY]).catch(() => null);
  let v = null;
  try { v = row?.value ? (typeof row.value === "string" ? JSON.parse(row.value) : row.value) : null; } catch {}
  return v && typeof v === "object" ? v : null;
}
async function writeState(v, userId) {
  if (!v) return execute("DELETE FROM app_settings WHERE name = ?", [KEY]);
  await execute("INSERT INTO app_settings (name, value, updated_by) VALUES (?, ?, ?) AS new ON DUPLICATE KEY UPDATE value = new.value, updated_by = new.updated_by", [KEY, JSON.stringify(v), userId]);
}

/** Four groups of four, without look-alike characters, so it can be read out and typed on a phone. */
function newPassword() {
  const pick = () => PASSWORD_ALPHABET[crypto.randomInt(PASSWORD_ALPHABET.length)];
  return Array.from({ length: 4 }, () => Array.from({ length: 4 }, pick).join("")).join("-");
}

/** For the Mobile app page: the account as it is now (null when there is none, or it was deleted, by the reviewer too). */
export async function reviewAccount() {
  const s = await readState();
  if (!s?.user_id) return null;
  const user = await queryOne("SELECT id, name, email, status, created_at, last_login_at FROM users WHERE id = ?", [s.user_id]);
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, status: user.status, created_at: user.created_at, last_login_at: user.last_login_at, friend_id: s.friend_id ?? null };
}

const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

/**
 * Makes the account (and its friend) with the sample workspace, in English or (lang "zh-CN") Chinese; answers
 * { email, password } — the only time the password is shown.
 */
export async function createReviewAccount({ email, lang } = {}, adminId) {
  if (await reviewAccount()) throw new HttpError("There already is an App Review account. Remove it first, or make a new password.", 409);
  const address = String(email || REVIEW_DEFAULT_EMAIL).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 190) throw new HttpError("That does not look like an email address.", 400);
  for (const a of [address, friendEmail(address)]) {
    if (await queryOne("SELECT id FROM users WHERE email = ?", [a])) throw new HttpError(`An account with ${a} already exists.`, 409);
  }
  const sample = SAMPLE[lang] ?? SAMPLE.en;
  const password = newPassword();
  let userId = null;
  let friendId = null;
  try {
    userId = await createAccount({ name: "App Review", email: address, passwordHash: hashPassword(password) });
    friendId = await createAccount({ name: sample.friend, email: friendEmail(address), passwordHash: hashPassword(newPassword()) });
    await execute("UPDATE users SET module_access = NULL, notification_prefs = ?, avatar_color = ? WHERE id = ?", [QUIET, "#6366f1", userId]);
    await execute("UPDATE users SET module_access = NULL, notification_prefs = ?, avatar_color = ?, avatar = 'initials' WHERE id = ?", [QUIET, FRIEND.color, friendId]);
    await seedWorkspace(userId, address, sample);
    await seedChat(userId, friendId, sample);
    await writeState({ user_id: userId, friend_id: friendId, created_at: new Date().toISOString() }, adminId);
  } catch (e) {
    for (const id of [userId, friendId]) if (id) await deleteAccount(id).catch(() => {});
    throw e;
  }
  return { email: address, password };
}

/** A new password for it (the old one stops working and its sessions end). */
export async function resetReviewPassword() {
  const acct = await reviewAccount();
  if (!acct) throw new HttpError("There is no App Review account.", 404);
  const password = newPassword();
  await execute("UPDATE users SET password_hash = ?, status = 'active' WHERE id = ?", [hashPassword(password), acct.id]);
  await execute("DELETE FROM sessions WHERE user_id = ?", [acct.id]);
  return { email: acct.email, password };
}

/** Deletes the account and its friend with everything in them. */
export async function removeReviewAccount() {
  const s = await readState();
  for (const id of [s?.user_id, s?.friend_id]) {
    if (id && (await queryOne("SELECT id FROM users WHERE id = ?", [id]))) await deleteAccount(id);
  }
  await writeState(null);
}

/**
 * The sample content in English and in Chinese (for the Chinese App Store screenshots). Per task: title, description,
 * project, assignees (the first leads), status, priority, starts and due (days from today), tags, checklist
 * [title, done] and comments [person, text, minutes ago].
 */
const SAMPLE = {
  en: {
    workspace: ["Northwind Studio", "Sample workspace for App Review"],
    friend: "Sam Lee",
    projects: [
      ["web", "Website relaunch", "WEB", "New website with a clearer pricing page, faster pages and a blog that is easy to update.", "active", "#6366f1", -21, 30],
      ["app", "Mobile app 2.0", "APP", "Offline lists, better notifications and a fresh look for the phone app.", "active", "#f59e0b", -10, 60],
      ["q4", "Q4 campaign", "Q4", "Newsletter, webinar and the launch event for the end of the year.", "planning", "#10b981", 0, 75],
    ],
    people: {
      me: ["App", "Review", "Project lead", "Management"],
      maya: ["Maya", "Chen", "Product designer", "Design"],
      daniel: ["Daniel", "Brooks", "iOS developer", "Engineering"],
      priya: ["Priya", "Nair", "Marketing lead", "Marketing"],
      tom: ["Tom", "Becker", "Backend developer", "Engineering"],
    },
    tasks: [
      ["Homepage hero and navigation", "New hero section with the product screenshot, and a navigation that stays on top while scrolling.", "web", ["maya", "me"], "in_progress", "high", -6, 2, "design,web",
        [["Hero copy", 1], ["Navigation states", 1], ["Phone layout", 0], ["Accessibility check", 0]],
        [["maya", "First draft is ready, feedback welcome.", 300], ["tom", "Looks great. The menu needs a sticky state when you scroll.", 120]]],
      ["Pricing page", "Three plans side by side, yearly billing switch and a short FAQ.", "web", ["me", "maya"], "todo", "medium", 0, 5, "web",
        [["Plan comparison table", 0], ["Yearly billing switch", 0], ["FAQ section", 0]], []],
      ["Fix contact form validation", "People can send the form with an empty phone number. Keep the field optional but check it when filled in.", "web", ["me", "tom"], "todo", "urgent", -3, -1, "bug",
        [], [["tom", "Found it: the check only runs on the email field.", 90]]],
      ["Set up analytics events", "Track sign-ups, plan changes and newsletter clicks.", "web", ["tom"], "review", "medium", -8, 1, "web", [["Event names agreed", 1], ["Dashboard", 0]], []],
      ["Move blog posts", "Bring over the 40 newest posts with their images.", "web", ["priya"], "done", "low", -20, -4, "content", [], []],
      ["Offline mode for task lists", "Lists open without a connection; changes are sent when the phone is back online.", "app", ["daniel", "me"], "in_progress", "high", -5, 7, "ios",
        [["Local cache", 1], ["Send changes later", 1], ["Conflict handling", 0], ["Tests", 0]],
        [["daniel", "The cache works. Sending changes later is next.", 45]]],
      ["App Store screenshots", "Five screenshots with short captions, in English and Chinese.", "app", ["maya", "me"], "todo", "medium", 0, 4, "design,ios",
        [["iPhone screenshots", 0], ["Captions", 0], ["Chinese versions", 0]], []],
      ["Notification settings screen", "Let people pick which notifications they get on the phone.", "app", ["daniel"], "todo", "medium", 2, 10, "ios", [], []],
      ["Beta feedback round", "Collect what 20 beta testers said and sort it by how often it came up.", "app", ["priya"], "done", "low", -15, -6, "research", [], []],
      ["Customer newsletter — October", "What is new this month, two customer stories and the webinar invitation.", "q4", ["priya", "me"], "review", "medium", -4, 0, "marketing",
        [["Draft", 1], ["Images", 1], ["Final read", 0]], [["priya", "Draft is in, can you give it a last read today?", 30]]],
      ["Plan the launch event", "Venue, guest list and agenda for the evening launch.", "q4", ["me", "priya"], "todo", "high", 1, 3, "event",
        [["Book the venue", 0], ["Guest list", 0], ["Agenda", 0]], []],
      ["Webinar landing page", "Sign-up page for the December webinar.", "q4", ["maya"], "todo", "low", 5, 14, "web", [], []],
    ],
    assigned: (by, title) => `${by} assigned you: ${title}`,
    chat: [
      ["friend", "text", "Hi! Welcome to Task Portal 👋", 95],
      ["friend", "text", "I put the homepage draft in the Website relaunch project. Could you have a look today?", 94],
      ["me", "text", "Sure, I'll check it after lunch.", 60],
      ["friend", "sticker", "👍", 59],
      ["friend", "text", "Thanks! The pricing page is next, I added a checklist to it.", 12],
    ],
  },
  "zh-CN": {
    workspace: ["北风工作室", "App 审核用的示例工作区"],
    friend: "李明",
    projects: [
      ["web", "官网改版", "WEB", "全新官网：更清晰的价格页、更快的页面，以及易于更新的博客。", "active", "#6366f1", -21, 30],
      ["app", "手机应用 2.0", "APP", "离线清单、更好的通知和全新的界面。", "active", "#f59e0b", -10, 60],
      ["q4", "第四季度推广", "Q4", "年底的电子报、网络研讨会和发布活动。", "planning", "#10b981", 0, 75],
    ],
    // Chinese names are written whole in first_name, so they show without a space
    people: {
      me: ["App", "Review", "项目负责人", "管理"],
      maya: ["陈美雅", "", "产品设计师", "设计"],
      daniel: ["王大伟", "", "iOS 开发", "工程"],
      priya: ["林佳", "", "市场负责人", "市场"],
      tom: ["赵涛", "", "后端开发", "工程"],
    },
    tasks: [
      ["首页主视觉和导航", "新的首页主视觉，放上产品截图；导航在滚动时固定在顶部。", "web", ["maya", "me"], "in_progress", "high", -6, 2, "设计,网站",
        [["主视觉文案", 1], ["导航状态", 1], ["手机版布局", 0], ["无障碍检查", 0]],
        [["maya", "初稿已经好了，欢迎提意见。", 300], ["tom", "很不错。滚动时菜单需要固定在顶部。", 120]]],
      ["价格页", "三个方案并排展示，加上按年付费开关和简短的常见问题。", "web", ["me", "maya"], "todo", "medium", 0, 5, "网站",
        [["方案对比表", 0], ["按年付费开关", 0], ["常见问题", 0]], []],
      ["修复联系表单校验", "电话号码为空时表单也能提交。电话保持选填，但填写时要校验。", "web", ["me", "tom"], "todo", "urgent", -3, -1, "缺陷",
        [], [["tom", "找到了：校验只在邮箱字段上运行。", 90]]],
      ["设置数据分析事件", "跟踪注册、方案变更和电子报点击。", "web", ["tom"], "review", "medium", -8, 1, "网站", [["事件名称已确认", 1], ["数据看板", 0]], []],
      ["迁移博客文章", "把最新的 40 篇文章连同图片一起迁移过来。", "web", ["priya"], "done", "low", -20, -4, "内容", [], []],
      ["任务列表离线模式", "没有网络也能打开列表；恢复联网后再发送更改。", "app", ["daniel", "me"], "in_progress", "high", -5, 7, "ios",
        [["本地缓存", 1], ["稍后发送更改", 1], ["冲突处理", 0], ["测试", 0]],
        [["daniel", "缓存已经可以用了，接下来做稍后发送更改。", 45]]],
      ["App Store 截图", "五张带简短说明的截图，中英文各一套。", "app", ["maya", "me"], "todo", "medium", 0, 4, "设计,ios",
        [["iPhone 截图", 0], ["说明文字", 0], ["中文版本", 0]], []],
      ["通知设置页面", "让用户选择在手机上接收哪些通知。", "app", ["daniel"], "todo", "medium", 2, 10, "ios", [], []],
      ["整理 Beta 反馈", "整理 20 位测试用户的反馈，按出现频率排序。", "app", ["priya"], "done", "low", -15, -6, "调研", [], []],
      ["十月客户电子报", "本月新功能、两个客户故事和研讨会邀请。", "q4", ["priya", "me"], "review", "medium", -4, 0, "市场",
        [["初稿", 1], ["配图", 1], ["终审", 0]], [["priya", "初稿已经放上来了，今天能帮忙最后看一遍吗？", 30]]],
      ["筹备发布活动", "晚间发布活动的场地、嘉宾名单和流程。", "q4", ["me", "priya"], "todo", "high", 1, 3, "活动",
        [["预订场地", 0], ["嘉宾名单", 0], ["活动流程", 0]], []],
      ["研讨会报名页", "十二月网络研讨会的报名页面。", "q4", ["maya"], "todo", "low", 5, 14, "网站", [], []],
    ],
    assigned: (by, title) => `${by}给你分配了：${title}`,
    chat: [
      ["friend", "text", "你好！欢迎使用 Task Portal 👋", 95],
      ["friend", "text", "我把首页初稿放到“官网改版”项目里了，今天能帮忙看一下吗？", 94],
      ["me", "text", "好的，我午饭后看。", 60],
      ["friend", "sticker", "👍", 59],
      ["friend", "text", "谢谢！接下来是价格页，我已经给它加了清单。", 12],
    ],
  },
};
export const REVIEW_LANGS = Object.keys(SAMPLE);
const PERSON = { me: ["#6366f1", null], maya: ["#ec4899", "maya.chen"], daniel: ["#0ea5e9", "daniel.brooks"], priya: ["#10b981", "priya.nair"], tom: ["#f59e0b", "tom.becker"] };

async function seedWorkspace(userId, address, sample) {
  const profileId = (await queryOne("SELECT id FROM profiles WHERE user_id = ? AND is_default = 1", [userId])).id;
  await execute("UPDATE profiles SET name = ?, description = ? WHERE id = ?", [...sample.workspace, profileId]);
  const ins = (sql, params) => execute(sql, params).then((r) => r.insertId);

  const projects = {};
  const projectNames = {};
  for (const [key, name, code, description, status, color, start, end] of sample.projects) {
    projects[key] = await ins(
      "INSERT INTO projects (user_id, profile_id, name, code, description, status, color, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [userId, profileId, name, code, description, status, color, day(start), day(end)]
    );
    projectNames[key] = name;
  }

  const people = {};
  const names = {};
  for (const [key, [first, last, job, dept]] of Object.entries(sample.people)) {
    const [color, mailbox] = PERSON[key];
    people[key] = await ins(
      "INSERT INTO employees (user_id, profile_id, first_name, last_name, email, job_title, department, status, avatar_color, hired_at, linked_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)",
      [userId, profileId, first, last, mailbox ? `${mailbox}@example.com` : address, job, dept, color, day(-400), key === "me" ? userId : null]
    );
    names[key] = `${first} ${last}`.trim();
  }
  const team = [["web", ["me", "maya", "tom", "priya"]], ["app", ["me", "daniel", "maya", "tom"]], ["q4", ["me", "priya", "maya"]]];
  for (const [p, keys] of team) for (const k of keys) await execute("INSERT INTO project_employees (project_id, employee_id, role) VALUES (?, ?, ?)", [projects[p], people[k], k === "me" ? "Lead" : null]);

  let order = 0;
  for (const [title, description, p, assignees, status, priority, start, due, tags, checklist, comments] of sample.tasks) {
    const taskId = await ins(
      "INSERT INTO tasks (user_id, profile_id, title, description, project_id, employee_id, status, priority, start_date, due_date, tags, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [userId, profileId, title, description, projects[p], people[assignees[0]], status, priority, day(start), day(due), tags, ++order]
    );
    for (const [i, k] of assignees.entries()) await execute("INSERT INTO task_assignees (task_id, employee_id, position) VALUES (?, ?, ?)", [taskId, people[k], i]);
    for (const [i, [item, done]] of checklist.entries()) {
      await execute("INSERT INTO task_checklist (task_id, title, done, done_by, done_at, sort_order) VALUES (?, ?, ?, ?, ?, ?)", [taskId, item, done, done ? userId : null, done ? new Date() : null, i + 1]);
    }
    // written by people of the workspace who have no account here (user 0), so the comment shows their own name,
    // as one from a deleted account does
    for (const [k, text, ago] of comments) {
      await execute("INSERT INTO task_comments (task_id, user_id, author_name, body, created_at) VALUES (?, 0, ?, ?, NOW() - INTERVAL ? MINUTE)", [taskId, names[k], text, ago]);
    }
    if (assignees.includes("me") && status !== "done") {
      const by = names[assignees.find((k) => k !== "me") ?? "priya"];
      await execute(
        "INSERT INTO notifications (user_id, type, title, body, href, entity_type, entity_id, profile_id, created_at) VALUES (?, 'task_assigned', ?, ?, ?, 'task', ?, ?, NOW() - INTERVAL ? MINUTE)",
        [userId, sample.assigned(by, title), projectNames[p], `/tasks/${taskId}`, taskId, profileId, 20 + order * 37]
      );
    }
  }
}

async function seedChat(userId, friendId, sample) {
  await ensureFriendCode(userId);
  await ensureFriendCode(friendId);
  await execute("INSERT INTO friendships (requester_id, addressee_id, status, responded_at) VALUES (?, ?, 'accepted', NOW())", [friendId, userId]);
  const conversationId = await directConversation(friendId, userId, { create: true });
  let lastOwn = null;
  let last = null;
  for (const [who, kind, body, ago] of sample.chat) {
    const sender = who === "me" ? userId : friendId;
    last = (await execute("INSERT INTO messages (conversation_id, sender_id, kind, body, created_at) VALUES (?, ?, ?, ?, NOW() - INTERVAL ? MINUTE)", [conversationId, sender, kind, body, ago])).insertId;
    if (sender === userId) lastOwn = last;
  }
  // the friend has read everything; the reviewer has read up to their own reply, so the newest two show as unread
  await execute("UPDATE conversation_members SET last_read_message_id = ?, delivered_message_id = ? WHERE conversation_id = ? AND user_id = ?", [last, last, conversationId, friendId]);
  await execute("UPDATE conversation_members SET last_read_message_id = ? WHERE conversation_id = ? AND user_id = ?", [lastOwn, conversationId, userId]);
  await execute("UPDATE users SET last_seen_at = NOW() - INTERVAL 12 MINUTE WHERE id = ?", [friendId]);
}
