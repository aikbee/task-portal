/**
 * Creates the database + tables and seeds sample data when tables are empty.
 *
 *   npm run db:setup             -> create DB/tables if missing, seed if empty
 *   npm run db:reset             -> drop all tables, recreate, reseed
 *   node scripts/setup-db.mjs --no-seed
 *                                -> schema + migrations only; never writes demo data
 *                                   or demo logins. This is what deployments run.
 *                                   On an empty database it creates the first admin
 *                                   from ADMIN_EMAIL / ADMIN_PASSWORD (+ ADMIN_NAME).
 */
import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import { hashPassword, PASSWORD_MIN } from "../src/lib/password.js";
import { parseTableJson, tableToMarkdown } from "../src/lib/text-tables.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const RESET = process.argv.includes("--reset");
/** Production mode: apply schema + migrations, never insert demo data or demo logins. */
const NO_SEED = process.argv.includes("--no-seed") || process.env.SEED === "0";

const cfg = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
};
const DB_NAME = process.env.DB_NAME || "task_portal";
const UPLOAD_DIR = path.resolve(ROOT, process.env.UPLOAD_DIR || "uploads");

const log = (...a) => console.log("[db]", ...a);

async function main() {
  const server = await mysql.createConnection({ ...cfg, multipleStatements: true });
  await server.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  log(`database \`${DB_NAME}\` ready`);
  await server.end();

  const db = await mysql.createConnection({ ...cfg, database: DB_NAME, multipleStatements: true });

  if (RESET) {
    log("dropping tables...");
    await db.query(`
      SET FOREIGN_KEY_CHECKS = 0;
      DROP TABLE IF EXISTS notifications, sessions, notes, info_attachments, info_notes, info_items, task_outputs, task_attachments, requirement_attachments, tasks, requirements, project_employees, employees, projects, profiles, users;
      SET FOREIGN_KEY_CHECKS = 1;
    `);
    // clear uploaded files too
    try {
      for (const f of await fs.readdir(UPLOAD_DIR)) {
        if (f !== ".gitkeep") await fs.rm(path.join(UPLOAD_DIR, f), { force: true });
      }
    } catch {}
  }

  const schema = await fs.readFile(path.join(ROOT, "db", "schema.sql"), "utf8");
  await db.query(schema);
  log("schema applied");

  const ids = await seedUsers(db);
  await migrate(db, ids.adminId);
  await ensureProfiles(db);

  if (NO_SEED) {
    log("--no-seed: schema and migrations only, no sample data");
  } else {
    const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM projects");
    if (n > 0) {
      log(`tables already contain data (${n} projects) - skipping seed`);
    } else {
      await seed(db, ids);
    }
    await seedRequirements(db, ids.adminId);
    await seedDemoWorkspace(db, ids);
  }
  if (!process.env.SESSION_SECRET) log("WARNING: SESSION_SECRET is not set in .env.local - sessions use an insecure default secret");
  await db.end();
  log("done");
}

const hasColumn = async (db, table, col) => (await db.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [col]))[0].length > 0;
const hasIndex = async (db, table, name) => (await db.query(`SHOW INDEX FROM ${table} WHERE Key_name = ?`, [name]))[0].length > 0;
const hasFk = async (db, table, name) =>
  (await db.query(
    "SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'",
    [table, name]
  ))[0].length > 0;

/** Incremental changes for databases created by earlier versions of the schema. */
async function migrate(db, adminId) {
  if (!(await hasColumn(db, "notes", "user_id"))) {
    log("migrating: notes.user_id");
    await db.query(`ALTER TABLE notes
      ADD COLUMN user_id INT UNSIGNED NULL AFTER id,
      ADD KEY idx_notes_user (user_id),
      ADD CONSTRAINT fk_notes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`);
    await db.query("UPDATE notes SET user_id = ? WHERE user_id IS NULL", [adminId]);
  }
  // per-user ownership of the work modules (existing rows go to the first admin)
  for (const t of ["projects", "employees", "tasks"]) {
    if (await hasColumn(db, t, "user_id")) continue;
    log(`migrating: ${t}.user_id (existing rows -> admin #${adminId})`);
    await db.query(`ALTER TABLE ${t} ADD COLUMN user_id INT UNSIGNED NULL AFTER id`);
    await db.query(`UPDATE ${t} SET user_id = ? WHERE user_id IS NULL`, [adminId]);
    await db.query(`ALTER TABLE ${t} MODIFY user_id INT UNSIGNED NOT NULL,
      ADD KEY idx_${t}_owner (user_id),
      ADD CONSTRAINT fk_${t}_owner FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`);
  }
  if (await hasIndex(db, "projects", "uq_projects_code")) {
    log("migrating: project codes unique per owner");
    await db.query("ALTER TABLE projects DROP INDEX uq_projects_code, ADD UNIQUE KEY uq_projects_owner_code (user_id, code)");
  }
  if (await hasIndex(db, "employees", "uq_employees_email")) {
    log("migrating: employee emails unique per owner");
    await db.query("ALTER TABLE employees DROP INDEX uq_employees_email, ADD UNIQUE KEY uq_employees_owner_email (user_id, email)");
  }
  if (!(await hasColumn(db, "tasks", "requirement_id"))) {
    log("migrating: tasks.requirement_id");
    await db.query(`ALTER TABLE tasks ADD COLUMN requirement_id INT UNSIGNED NULL AFTER employee_id,
      ADD KEY idx_tasks_requirement (requirement_id),
      ADD CONSTRAINT fk_tasks_requirement FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE SET NULL`);
  }
  if (!(await hasColumn(db, "projects", "requirement_seq"))) {
    log("migrating: projects.requirement_seq");
    await db.query("ALTER TABLE projects ADD COLUMN requirement_seq INT UNSIGNED NOT NULL DEFAULT 0 AFTER budget");
    await db.query(`UPDATE projects p SET requirement_seq =
      (SELECT COALESCE(MAX(CAST(SUBSTRING(r.code, 5) AS UNSIGNED)), 0) FROM requirements r WHERE r.project_id = p.id)`);
  }
  {
    const [[col]] = await db.query("SELECT CHARACTER_MAXIMUM_LENGTH AS len FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'requirements' AND COLUMN_NAME = 'code'");
    if (col && col.len < 32) {
      log("migrating: requirements.code -> VARCHAR(32)");
      await db.query("ALTER TABLE requirements MODIFY code VARCHAR(32) NOT NULL");
    }
  }
  if (!(await hasColumn(db, "users", "notification_prefs"))) {
    log("migrating: users.notification_prefs");
    await db.query("ALTER TABLE users ADD COLUMN notification_prefs JSON NULL AFTER employee_id");
  }
  // profiles: several per user, every work row belongs to one
  {
    const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM profiles");
    const [users] = await db.query("SELECT id FROM users");
    if (n === 0 && users.length) {
      log("migrating: creating a default profile per user");
      await db.query("INSERT INTO profiles (user_id, name, description, color, is_default) VALUES ?", [users.map((u) => [u.id, "Personal", "Default profile", "#6366f1", 1])]);
    }
    for (const t of ["projects", "employees", "requirements", "tasks"]) {
      if (await hasColumn(db, t, "profile_id")) continue;
      log(`migrating: ${t}.profile_id`);
      await db.query(`ALTER TABLE ${t} ADD COLUMN profile_id INT UNSIGNED NULL AFTER user_id`);
      await db.query(`UPDATE ${t} t JOIN profiles p ON p.user_id = t.user_id AND p.is_default = 1 SET t.profile_id = p.id WHERE t.profile_id IS NULL`);
      await db.query(`ALTER TABLE ${t} MODIFY profile_id INT UNSIGNED NOT NULL,
        ADD KEY idx_${t}_profile (profile_id),
        ADD CONSTRAINT fk_${t}_profile FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE`);
    }
    if (await hasIndex(db, "projects", "uq_projects_owner_code")) {
      log("migrating: project codes unique per profile");
      await db.query("ALTER TABLE projects DROP INDEX uq_projects_owner_code, ADD UNIQUE KEY uq_projects_profile_code (profile_id, code)");
    }
    if (await hasIndex(db, "employees", "uq_employees_owner_email")) {
      log("migrating: employee emails unique per profile");
      await db.query("ALTER TABLE employees DROP INDEX uq_employees_owner_email, ADD UNIQUE KEY uq_employees_profile_email (profile_id, email)");
    }
    if (!(await hasColumn(db, "notifications", "profile_id"))) {
      log("migrating: notifications.profile_id");
      await db.query("ALTER TABLE notifications ADD COLUMN profile_id INT UNSIGNED NULL AFTER entity_id");
    }
  }
  if (!(await hasColumn(db, "users", "pin_hash"))) {
    log("migrating: users.pin_hash");
    await db.query("ALTER TABLE users ADD COLUMN pin_hash VARCHAR(255) NULL AFTER notification_prefs");
  }
  if (!(await hasColumn(db, "sessions", "unlocked_until"))) {
    log("migrating: sessions.unlocked_until");
    await db.query("ALTER TABLE sessions ADD COLUMN unlocked_until DATETIME NULL AFTER expires_at");
  }
  if (!(await hasColumn(db, "info_items", "project_id"))) {
    log("migrating: info_items.project_id");
    await db.query(`ALTER TABLE info_items ADD COLUMN project_id INT UNSIGNED NULL AFTER profile_id,
      ADD KEY idx_info_project (project_id),
      ADD CONSTRAINT fk_info_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL`);
  }
  for (const t of ["task_outputs", "info_notes"]) {
    if (await hasColumn(db, t, "format")) continue;
    log(`migrating: ${t}.format`);
    await db.query(`ALTER TABLE ${t} ADD COLUMN format ENUM('text','table') NOT NULL DEFAULT 'text' AFTER content`);
  }
  // Tables now live inside the text as Markdown; convert blocks saved in the earlier JSON table format.
  for (const t of ["task_outputs", "info_notes"]) {
    const [legacy] = await db.query(`SELECT id, content FROM ${t} WHERE format = 'table'`);
    for (const r of legacy) {
      const table = parseTableJson(r.content);
      await db.query(`UPDATE ${t} SET content = ?, format = 'text' WHERE id = ?`, [table ? tableToMarkdown(table) : r.content, r.id]);
    }
    if (legacy.length) log(`migrating: ${legacy.length} ${t} table block(s) -> Markdown text`);
  }
  if (await hasFk(db, "users", "fk_users_employee")) {
    log("migrating: dropping users -> employees foreign key");
    await db.query("ALTER TABLE users DROP FOREIGN KEY fk_users_employee");
  }
}

/** Every user gets a default profile (also covers users created before profiles existed). */
async function ensureProfiles(db) {
  const [missing] = await db.query("SELECT u.id FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE p.id IS NULL");
  if (missing.length) {
    await db.query("INSERT INTO profiles (user_id, name, description, color, is_default) VALUES ?", [missing.map((u) => [u.id, "Personal", "Default profile", "#6366f1", 1])]);
    log(`created default profiles for ${missing.length} user(s)`);
  }
  // exactly one default per user
  await db.query(`UPDATE profiles p JOIN (SELECT user_id, MIN(id) AS id FROM profiles GROUP BY user_id) f ON f.user_id = p.user_id
    LEFT JOIN (SELECT user_id FROM profiles WHERE is_default = 1 GROUP BY user_id) d ON d.user_id = p.user_id
    SET p.is_default = 1 WHERE d.user_id IS NULL AND p.id = f.id`);
}

/** Default profile id for a user (creating one if needed). */
async function defaultProfile(db, userId) {
  const [[row]] = await db.query("SELECT id FROM profiles WHERE user_id = ? ORDER BY is_default DESC, id LIMIT 1", [userId]);
  if (row) return row.id;
  const [res] = await db.query("INSERT INTO profiles (user_id, name, description, color, is_default) VALUES (?, 'Personal', 'Default profile', '#6366f1', 1)", [userId]);
  return res.insertId;
}

/** Sample requirements for the admin's seeded projects (only when the table is empty). */
async function seedRequirements(db, adminId) {
  const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM requirements");
  if (n > 0) return;
  const [projects] = await db.query("SELECT id, code FROM projects WHERE user_id = ? AND code IN ('ORION','ATLAS')", [adminId]);
  const byCode = Object.fromEntries(projects.map((p) => [p.code, p.id]));
  if (!byCode.ORION || !byCode.ATLAS) return;
  const [emps] = await db.query("SELECT id, email FROM employees WHERE user_id = ?", [adminId]);
  const emp = (mail) => emps.find((e) => e.email === mail)?.id ?? null;
  // project, code, title, description, acceptance, type, priority, status, stakeholder, order
  const rows = [
    [byCode.ORION, "REQ-001", "Single sign-on via Okta", "Customers authenticate with their corporate identity provider; portal roles are derived from IdP groups.", "- SAML login succeeds for a test tenant\n- Group→role mapping applied on first login\n- Session expires after 8h of inactivity", "functional", "must", "in_progress", emp("marcus.okafor@example.com"), 1],
    [byCode.ORION, "REQ-002", "Invoice history and download", "Customers can browse past invoices, filter by date and status, and download PDFs.", "- Invoices paginate 25 per page\n- PDF download under 2s p95\n- CSV export of the filtered list", "functional", "must", "approved", emp("priya.raman@example.com"), 2],
    [byCode.ORION, "REQ-003", "WCAG 2.2 AA accessibility", "All customer-facing screens meet WCAG 2.2 AA.", "- Automated axe scan passes\n- Keyboard-only walkthrough of every flow\n- Screen reader labels on all controls", "non_functional", "should", "draft", emp("kenji.sato@example.com"), 3],
    [byCode.ORION, "REQ-004", "Support ticket attachments", "Tickets accept multiple attachments up to 25 MB each.", "- Upload progress shown\n- Virus scan before storage\n- Images render inline", "functional", "could", "draft", emp("marcus.okafor@example.com"), 4],
    [byCode.ATLAS, "REQ-001", "Exactly-once event processing", "Pipeline must not duplicate or drop events across restarts.", "- Replay test shows zero duplicates\n- Checkpoint recovery under 60s", "technical", "must", "approved", emp("hannah.weiss@example.com"), 1],
    [byCode.ATLAS, "REQ-002", "Sub-minute freshness in the warehouse", "Sessionised data is queryable within 60 seconds of the event.", "- p95 end-to-end latency < 60s over 24h", "non_functional", "should", "in_progress", emp("hannah.weiss@example.com"), 2],
    [byCode.ATLAS, "REQ-003", "Schema evolution without downtime", "Producers can add optional fields without stopping consumers.", "- Backward-compatible schema check in CI\n- Consumer keeps running through a schema bump", "technical", "should", "draft", emp("marcus.okafor@example.com"), 3],
  ];
  const [[{ profile_id: adminProfile }]] = await db.query("SELECT profile_id FROM projects WHERE id = ?", [byCode.ORION]);
  await db.query(
    "INSERT INTO requirements (user_id, profile_id, project_id, code, title, description, acceptance_criteria, type, priority, status, employee_id, sort_order) VALUES ?",
    [rows.map((r) => [adminId, adminProfile, ...r])]
  );
  // link a few seeded tasks to requirements
  const [reqs] = await db.query("SELECT id, project_id, code FROM requirements WHERE user_id = ?", [adminId]);
  const req = (pid, code) => reqs.find((r) => r.project_id === pid && r.code === code)?.id;
  const links = [
    ["Set up SSO with Okta", req(byCode.ORION, "REQ-001")],
    ["Implement invoice list view", req(byCode.ORION, "REQ-002")],
    ["Portal accessibility audit", req(byCode.ORION, "REQ-003")],
    ["Support ticket API", req(byCode.ORION, "REQ-004")],
    ["Flink job: sessionization", req(byCode.ATLAS, "REQ-002")],
    ["Schema registry rollout", req(byCode.ATLAS, "REQ-003")],
  ];
  for (const [title, rid] of links) if (rid) await db.query("UPDATE tasks SET requirement_id = ? WHERE user_id = ? AND title = ?", [rid, adminId, title]);
  log(`seeded ${rows.length} requirements`);
}

/** Default login accounts (created whenever the users table is empty). Returns { adminId, userId }. */
async function seedUsers(db) {
  const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM users");
  if (n === 0 && NO_SEED) {
    // Deployments never get the demo logins. Create the operator's own admin instead.
    const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const password = String(process.env.ADMIN_PASSWORD || "");
    if (email && password) {
      if (password.length < PASSWORD_MIN) throw new Error(`ADMIN_PASSWORD must be at least ${PASSWORD_MIN} characters`);
      await db.query("INSERT INTO users (name, email, password_hash, role, avatar_color) VALUES (?, ?, ?, 'admin', '#6366f1')", [
        String(process.env.ADMIN_NAME || "Administrator").slice(0, 120),
        email,
        hashPassword(password),
      ]);
      log(`created the first admin account: ${email}`);
    } else {
      log("no accounts yet - set ADMIN_EMAIL and ADMIN_PASSWORD to create the first admin");
    }
  } else if (n === 0) {
    const accounts = [
      ["Admin User", "admin@example.com", "admin123", "admin", "#6366f1"],
      ["Demo User", "user@example.com", "user123", "user", "#06b6d4"],
    ];
    await db.query("INSERT INTO users (name, email, password_hash, role, avatar_color) VALUES ?", [
      accounts.map(([name, email, pw, role, color]) => [name, email, hashPassword(pw), role, color]),
    ]);
    log("seeded login accounts:");
    for (const [, email, pw, role] of accounts) log(`  ${role.padEnd(5)}  ${email}  /  ${pw}`);
  }
  const [[admin]] = await db.query("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
  const [[user]] = await db.query("SELECT id FROM users WHERE role = 'user' ORDER BY id LIMIT 1");
  return { adminId: admin?.id ?? null, userId: user?.id ?? admin?.id ?? null };
}

async function seed(db, { adminId, userId }) {
  log("seeding sample data...");
  const adminProfile = await defaultProfile(db, adminId);
  const userProfile = userId && userId !== adminId ? await defaultProfile(db, userId) : adminProfile;
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const projects = [
    ["Orion Customer Portal", "ORION", "Self-service portal for enterprise customers with SSO, billing and support ticketing.", "active", "#6366f1", "2026-03-02", "2026-11-30", 240000],
    ["Atlas Data Pipeline", "ATLAS", "Streaming ETL platform replacing nightly batch jobs. Kafka + Flink + warehouse.", "active", "#06b6d4", "2026-01-12", "2026-09-30", 185000],
    ["Nova Mobile App", "NOVA", "Cross-platform mobile app (iOS/Android) for field technicians.", "planning", "#f59e0b", "2026-10-01", "2027-03-31", 320000],
    ["Helix Design System", "HELIX", "Shared component library, tokens and documentation site.", "on_hold", "#10b981", "2025-11-01", "2026-06-30", 60000],
    ["Legacy CRM Migration", "CRM-MIG", "Migrate legacy CRM records into the new platform with zero downtime.", "completed", "#f43f5e", "2025-06-01", "2026-02-28", 95000],
  ];
  await db.query(
    "INSERT INTO projects (user_id, profile_id, name, code, description, status, color, start_date, end_date, budget) VALUES ?",
    [projects.map((p) => [adminId, adminProfile, ...p])]
  );

  const employees = [
    ["Amelia", "Chen", "amelia.chen@example.com", "+1 415 555 0101", "Engineering Manager", "Engineering", "active", "#6366f1", "2021-04-12"],
    ["Marcus", "Okafor", "marcus.okafor@example.com", "+1 415 555 0102", "Senior Backend Engineer", "Engineering", "active", "#06b6d4", "2022-01-03"],
    ["Priya", "Raman", "priya.raman@example.com", "+1 415 555 0103", "Frontend Engineer", "Engineering", "active", "#8b5cf6", "2023-06-19"],
    ["Diego", "Alvarez", "diego.alvarez@example.com", "+1 415 555 0104", "Product Designer", "Design", "active", "#f59e0b", "2022-09-05"],
    ["Hannah", "Weiss", "hannah.weiss@example.com", "+1 415 555 0105", "Data Engineer", "Data", "active", "#10b981", "2021-11-22"],
    ["Kenji", "Sato", "kenji.sato@example.com", "+1 415 555 0106", "QA Engineer", "Quality", "on_leave", "#f43f5e", "2020-02-10"],
    ["Fatima", "Hassan", "fatima.hassan@example.com", "+1 415 555 0107", "Product Manager", "Product", "active", "#0ea5e9", "2019-08-01"],
    ["Liam", "O'Brien", "liam.obrien@example.com", "+1 415 555 0108", "DevOps Engineer", "Engineering", "active", "#ec4899", "2023-02-14"],
    ["Sofia", "Rossi", "sofia.rossi@example.com", "+1 415 555 0109", "Mobile Engineer", "Engineering", "inactive", "#84cc16", "2021-07-07"],
    ["Noah", "Patel", "noah.patel@example.com", "+1 415 555 0110", "Technical Writer", "Product", "active", "#a855f7", "2024-03-25"],
  ];
  await db.query(
    "INSERT INTO employees (user_id, profile_id, first_name, last_name, email, phone, job_title, department, status, avatar_color, hired_at) VALUES ?",
    [employees.map((e) => [adminId, adminProfile, ...e])]
  );

  // project_id, employee_id, role
  const members = [
    [1, 1, "Lead"], [1, 2, "Backend"], [1, 3, "Frontend"], [1, 4, "Design"], [1, 7, "PM"], [1, 6, "QA"],
    [2, 1, "Sponsor"], [2, 2, "Backend"], [2, 5, "Data"], [2, 8, "Infra"],
    [3, 4, "Design"], [3, 7, "PM"], [3, 9, "Mobile"], [3, 3, "Frontend"],
    [4, 3, "Frontend"], [4, 4, "Lead"], [4, 10, "Docs"],
    [5, 2, "Backend"], [5, 5, "Data"], [5, 8, "Infra"], [5, 6, "QA"],
  ];
  await db.query("INSERT INTO project_employees (project_id, employee_id, role) VALUES ?", [members]);

  // title, description, project_id, employee_id, status, priority, due_date
  const tasks = [
    ["Set up SSO with Okta", "Integrate SAML login flow and map groups to portal roles.", 1, 2, "in_progress", "high", "2026-09-12"],
    ["Design billing dashboard", "Wireframes + hi-fi mockups for invoices, usage and payment methods.", 1, 4, "review", "medium", "2026-09-08"],
    ["Implement invoice list view", "Paginated table with filters, export to CSV.", 1, 3, "todo", "medium", "2026-09-20"],
    ["Support ticket API", "REST endpoints for creating/updating tickets and attachments.", 1, 2, "todo", "high", "2026-09-25"],
    ["Portal accessibility audit", "WCAG 2.2 AA audit across all customer-facing screens.", 1, 6, "todo", "low", "2026-10-10"],
    ["Write portal release notes", "Customer-facing notes for v1.0 launch.", 1, 7, "done", "low", "2026-08-28"],
    ["Kafka topic design", "Define partitioning strategy and retention for event topics.", 2, 5, "done", "high", "2026-08-15"],
    ["Flink job: sessionization", "Sessionize clickstream events with 30-min inactivity gap.", 2, 5, "in_progress", "urgent", "2026-09-05"],
    ["Provision warehouse cluster", "Terraform for the analytics warehouse + IAM policies.", 2, 8, "done", "medium", "2026-08-20"],
    ["Schema registry rollout", "Deploy schema registry and enforce compatibility checks in CI.", 2, 2, "review", "medium", "2026-09-10"],
    ["Backfill 2025 data", "One-off backfill of historical events into the new pipeline.", 2, 5, "todo", "medium", "2026-09-30"],
    ["Mobile app discovery interviews", "Interview 8 field technicians about daily workflows.", 3, 7, "in_progress", "high", "2026-09-15"],
    ["Offline-first architecture spike", "Evaluate SQLite sync approaches for spotty connectivity.", 3, 9, "todo", "high", "2026-10-05"],
    ["App icon & splash concepts", "Three directions for review.", 3, 4, "todo", "low", "2026-10-12"],
    ["Token naming conventions", "Finalize color/spacing/typography token names.", 4, 4, "done", "medium", "2026-05-30"],
    ["Button component", "All variants, sizes, loading and icon states.", 4, 3, "done", "medium", "2026-06-10"],
    ["Docs site search", "Add Algolia-style search to the component docs.", 4, 10, "todo", "low", null],
    ["Data mapping spreadsheet", "Field-by-field mapping between legacy and new CRM.", 5, 5, "done", "high", "2025-09-01"],
    ["Dry-run migration", "Full migration into staging; compare record counts.", 5, 2, "done", "urgent", "2026-01-20"],
    ["Cutover runbook", "Step-by-step plan for production cutover weekend.", 5, 8, "done", "high", "2026-02-20"],
    ["Post-migration QA", "Spot-check 500 random records for data integrity.", 5, 6, "done", "medium", "2026-02-27"],
    ["Quarterly planning deck", "Engineering priorities for Q4.", null, 1, "in_progress", "medium", "2026-09-19"],
    ["Update onboarding guide", "Refresh the new-hire engineering onboarding doc.", null, 10, "todo", "low", null],
  ];
  const ins = await db.query(
    "INSERT INTO tasks (user_id, profile_id, title, description, project_id, employee_id, status, priority, due_date, sort_order) VALUES ?",
    [tasks.map((t, i) => [adminId, adminProfile, ...t, i + 1])]
  );
  const firstTaskId = ins[0].insertId;

  // outputs for a few tasks: task offset, title, content, sort_order
  const outputs = [
    [0, "Okta SAML config", "Entity ID: https://portal.example.com/saml/metadata\nACS URL: https://portal.example.com/saml/acs\nNameID format: emailAddress\n\nGroup mapping:\n  portal-admins  -> admin\n  portal-billing -> billing\n  portal-users   -> member", 1],
    [0, "Test log - staging", "2026-09-01 10:12  login ok (amelia.chen)\n2026-09-01 10:14  login ok (marcus.okafor)\n2026-09-01 10:20  group mapping applied: billing\n2026-09-01 10:31  logout ok", 2],
    [7, "Flink job plan", "1. Read from topic `clickstream.raw`\n2. Key by user_id\n3. Session window (gap 30m)\n4. Aggregate -> session_id, start, end, page_count\n5. Sink to `clickstream.sessions` + warehouse", 1],
    [7, "Benchmark results", "Throughput (staging, 3 task managers):\n  p50 latency  42 ms\n  p95 latency 180 ms\n  max sustained 38k events/s\n\nNext: try RocksDB state backend with incremental checkpoints.", 2],
    [18, "Record count comparison", "accounts   legacy 48,213  new 48,213  OK\ncontacts   legacy 391,880 new 391,880 OK\nopportunities legacy 12,904 new 12,901  DIFF (-3, duplicates removed)", 1],
  ];
  await db.query(
    "INSERT INTO task_outputs (task_id, title, content, sort_order) VALUES ?",
    [outputs.map(([off, title, content, so]) => [firstTaskId + off, title, content, so])]
  );

  // a couple of seeded text attachments (real files written to the uploads dir)
  const attachments = [
    [0, "okta-metadata.xml", "application/xml", `<?xml version="1.0"?>\n<EntityDescriptor entityID="https://portal.example.com/saml/metadata">\n  <!-- sample metadata -->\n</EntityDescriptor>\n`, 1],
    [0, "sso-checklist.md", "text/markdown", "# SSO checklist\n\n- [x] Metadata exchanged\n- [x] Group mapping\n- [ ] Production certificate\n- [ ] Failover test\n", 2],
    [7, "flink-config.yaml", "application/yaml", "taskmanager.numberOfTaskSlots: 4\nstate.backend: rocksdb\nstate.checkpoints.dir: s3://atlas-checkpoints/sessionization\nexecution.checkpointing.interval: 60s\n", 1],
  ];
  const attRows = [];
  for (const [off, name, mime, body, so] of attachments) {
    const stored = `seed-${off}-${so}-${name}`;
    await fs.writeFile(path.join(UPLOAD_DIR, stored), body, "utf8");
    attRows.push([firstTaskId + off, stored, name, mime, Buffer.byteLength(body), so]);
  }
  await db.query(
    "INSERT INTO task_attachments (task_id, stored_name, original_name, mime_type, size_bytes, sort_order) VALUES ?",
    [attRows]
  );

  const notes = [
    ["dashboard", "Welcome", "Sticky notes live in the bottom bar and are scoped to the module you are viewing.", "yellow", 1, 1],
    ["projects", "Budget review", "Orion budget review with finance on Friday. Bring the Q3 burn chart.", "pink", 0, 1],
    ["tasks", "Sprint focus", "Sessionization job is blocking the Atlas demo - unblock Hannah first.", "blue", 1, 1],
    ["employees", "Hiring", "Two open reqs: mobile engineer + data engineer. Screen candidates Tue/Thu.", "green", 0, 1],
  ];
  await db.query(
    "INSERT INTO notes (user_id, module, title, content, color, pinned, sort_order) VALUES ?",
    [notes.map((n) => [adminId, ...n])]
  );

  log(`seeded ${projects.length} projects, ${employees.length} employees, ${tasks.length} tasks for the admin workspace`);


}

/** A small workspace for the demo user so their account is not empty (runs when they have no projects). */
async function seedDemoWorkspace(db, { adminId, userId }) {
  if (!userId || userId === adminId) return;
  const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM projects WHERE user_id = ?", [userId]);
  if (n > 0) return;
    const [p] = await db.query(
      "INSERT INTO projects (user_id, profile_id, name, code, description, status, color, start_date, end_date, budget) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [userId, userProfile, "Website Refresh", "WEB", "Marketing site redesign with a new CMS.", "active", "#0ea5e9", "2026-08-01", "2026-12-15", 45000]
    );
    const [e] = await db.query(
      "INSERT INTO employees (user_id, profile_id, first_name, last_name, email, phone, job_title, department, status, avatar_color, hired_at) VALUES ?",
      [[
        [userId, userProfile, "Olivia", "Park", "olivia.park@example.com", "+1 415 555 0201", "Web Designer", "Design", "active", "#ec4899", "2024-05-06"],
        [userId, userProfile, "Ethan", "Brooks", "ethan.brooks@example.com", "+1 415 555 0202", "Frontend Developer", "Engineering", "active", "#10b981", "2023-09-18"],
      ]]
    );
    const emp1 = e.insertId;
    const emp2 = e.insertId + 1;
    await db.query("INSERT INTO project_employees (project_id, employee_id, role) VALUES ?", [[[p.insertId, emp1, "Design"], [p.insertId, emp2, "Frontend"]]]);
    await db.query(
      "INSERT INTO tasks (user_id, profile_id, title, description, project_id, employee_id, status, priority, due_date, sort_order) VALUES ?",
      [[
        [userId, userProfile, "Homepage wireframes", "Three layout options for the new homepage.", p.insertId, emp1, "in_progress", "high", "2026-09-20", 1],
        [userId, userProfile, "Set up CMS", "Install and configure the headless CMS.", p.insertId, emp2, "todo", "medium", "2026-10-01", 2],
        [userId, userProfile, "Migrate blog posts", "Move 120 posts from the old site.", p.insertId, emp2, "todo", "low", "2026-11-01", 3],
      ]]
    );
    log("seeded a small workspace for the demo user");
}

main().catch((err) => {
  console.error("[db] setup failed:", err.message);
  process.exit(1);
});
