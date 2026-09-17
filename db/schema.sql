-- Task Portal schema (MySQL 8+/9)
-- Applied by: npm run db:setup

-- Login accounts (roles: admin manages users; user has access to the work modules).
-- Every project / employee / task belongs to one user (its workspace).
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','user') NOT NULL DEFAULT 'user',
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  avatar_color VARCHAR(16) NOT NULL DEFAULT '#6366f1',
  avatar VARCHAR(255) NULL, -- NULL = the default "pro" icon · 'initials' · 'preset:<key>' · 'upload:user:<id>:<stored file>'
  employee_id INT UNSIGNED NULL,
  notification_prefs JSON NULL, -- { muted: ["tasks", ...] }
  pin_hash VARCHAR(255) NULL, -- lock-screen PIN (scrypt) so secrets can be re-verified server-side
  google_sub VARCHAR(64) NULL, -- Google account id once "Continue with Google" has been used or connected
  totp_secret VARCHAR(255) NULL, -- encrypted authenticator secret while two-factor authentication is on
  totp_enabled_at DATETIME NULL,
  totp_last_step BIGINT UNSIGNED NULL, -- last accepted 30 s time step, so a code cannot be replayed
  friend_code VARCHAR(16) NULL, -- XXXX-XXXX-XXXX shown as a QR code so friends can add you in Chat
  last_login_at DATETIME NULL,
  last_seen_at DATETIME NULL, -- presence: stamped when the chat stream connects and when it drops
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_google_sub (google_sub),
  UNIQUE KEY uq_users_friend_code (friend_code),
  KEY idx_users_role (role),
  KEY idx_users_employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Server-side login sessions (cookie holds the signed session id)
CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(48) NOT NULL PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  unlocked_until DATETIME NULL, -- secrets may be revealed without re-verifying until this time
  user_agent VARCHAR(255) NULL,
  ip VARCHAR(45) NULL,
  last_seen_at DATETIME NULL, -- refreshed at most every five minutes
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expires (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sign-in history (successful and failed attempts) shown on the Security page; pruned after 180 days
CREATE TABLE IF NOT EXISTS login_events (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  session_id CHAR(48) NULL, -- the session a successful sign-in created (not a foreign key: sessions come and go)
  method VARCHAR(16) NOT NULL, -- password | totp | passkey | google
  success TINYINT(1) NOT NULL DEFAULT 1,
  reason VARCHAR(40) NULL, -- wrong_password | wrong_code | passkey_failed | disabled
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  browser VARCHAR(40) NULL,
  os VARCHAR(40) NULL,
  device VARCHAR(16) NULL, -- desktop | phone | tablet
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_login_events_user (user_id, id),
  CONSTRAINT fk_login_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WebAuthn passkeys (Touch ID, Face ID, Windows Hello, security keys) registered from Profile & password
CREATE TABLE IF NOT EXISTS passkeys (
  id VARCHAR(255) NOT NULL PRIMARY KEY, -- credential id (base64url)
  user_id INT UNSIGNED NOT NULL,
  public_key VARBINARY(1024) NOT NULL,
  counter BIGINT UNSIGNED NOT NULL DEFAULT 0,
  transports VARCHAR(120) NULL, -- comma-separated hints (internal, hybrid, usb, ...)
  device_type VARCHAR(32) NULL, -- singleDevice | multiDevice
  backed_up TINYINT(1) NOT NULL DEFAULT 0,
  name VARCHAR(80) NOT NULL DEFAULT 'Passkey',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NULL,
  KEY idx_passkeys_user (user_id),
  CONSTRAINT fk_passkeys_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One-time recovery codes for two-factor authentication (SHA-256 of the code; ten per user)
CREATE TABLE IF NOT EXISTS recovery_codes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  code_hash CHAR(64) NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_recovery_user (user_id),
  CONSTRAINT fk_recovery_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Browsers remembered for 30 days after a second-factor sign-in ("trust this browser")
CREATE TABLE IF NOT EXISTS trusted_devices (
  id CHAR(48) NOT NULL PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NULL,
  expires_at DATETIME NOT NULL,
  KEY idx_trusted_user (user_id),
  KEY idx_trusted_expires (expires_at),
  CONSTRAINT fk_trusted_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A user can have several profiles; each one is a separate set of projects / requirements / employees / tasks
CREATE TABLE IF NOT EXISTS profiles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(255) NULL,
  color VARCHAR(16) NOT NULL DEFAULT '#6366f1',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_profiles_user_name (user_id, name),
  KEY idx_profiles_user (user_id),
  CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- People a profile is shared with. The owner is profiles.user_id and never has a row here.
-- user_id / invited_by carry no foreign key on purpose: deleting a user already cascades through close to the
-- 30 tables InnoDB allows, so these rows are removed in code (DELETE /api/users/:id) and every read joins users.
CREATE TABLE IF NOT EXISTS profile_members (
  profile_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  role ENUM('viewer','editor','manager') NOT NULL DEFAULT 'viewer',
  status ENUM('invited','active') NOT NULL DEFAULT 'invited',
  invited_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP NULL,
  PRIMARY KEY (profile_id, user_id),
  KEY idx_pm_user (user_id, status),
  CONSTRAINT fk_pm_profile FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS projects (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  profile_id INT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  code VARCHAR(32) NOT NULL,
  description TEXT NULL,
  status ENUM('planning','active','on_hold','completed','archived') NOT NULL DEFAULT 'planning',
  color VARCHAR(16) NOT NULL DEFAULT '#6366f1',
  start_date DATE NULL,
  end_date DATE NULL,
  budget DECIMAL(14,2) NULL,
  requirement_seq INT UNSIGNED NOT NULL DEFAULT 0, -- last REQ-nnn number issued (never reused)
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_projects_profile_code (profile_id, code),
  KEY idx_projects_status (status),
  KEY idx_projects_owner (user_id),
  KEY idx_projects_profile (profile_id),
  CONSTRAINT fk_projects_owner FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_projects_profile FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS employees (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  profile_id INT UNSIGNED NOT NULL,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(40) NULL,
  job_title VARCHAR(120) NULL,
  department VARCHAR(120) NULL,
  status ENUM('active','on_leave','inactive') NOT NULL DEFAULT 'active',
  avatar_color VARCHAR(16) NOT NULL DEFAULT '#0ea5e9',
  hired_at DATE NULL,
  linked_user_id INT UNSIGNED NULL, -- the portal account this person signs in with (the owner or a member of the profile); no FK, cleared in code
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_employees_profile_email (profile_id, email),
  KEY idx_employees_linked (linked_user_id),
  KEY idx_employees_status (status),
  KEY idx_employees_department (department),
  KEY idx_employees_owner (user_id),
  KEY idx_employees_profile (profile_id),
  CONSTRAINT fk_employees_owner FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_employees_profile FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Project <-> Employee (many-to-many)
CREATE TABLE IF NOT EXISTS project_employees (
  project_id INT UNSIGNED NOT NULL,
  employee_id INT UNSIGNED NOT NULL,
  role VARCHAR(80) NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, employee_id),
  KEY idx_pe_employee (employee_id),
  CONSTRAINT fk_pe_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_pe_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- What a project must deliver; ordered within the project, linked to tasks
CREATE TABLE IF NOT EXISTS requirements (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  profile_id INT UNSIGNED NOT NULL,
  project_id INT UNSIGNED NOT NULL,
  code VARCHAR(32) NOT NULL, -- auto REQ-nnn, editable
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  acceptance_criteria TEXT NULL,
  type ENUM('functional','non_functional','technical','business','constraint') NOT NULL DEFAULT 'functional',
  priority ENUM('must','should','could','wont') NOT NULL DEFAULT 'should',
  status ENUM('draft','approved','in_progress','done','rejected') NOT NULL DEFAULT 'draft',
  employee_id INT UNSIGNED NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_req_project_code (project_id, code),
  KEY idx_req_owner (user_id),
  KEY idx_req_profile (profile_id),
  KEY idx_req_project (project_id, sort_order),
  KEY idx_req_status (status),
  CONSTRAINT fk_req_owner FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_req_profile FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_req_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_req_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Task belongs to one employee (assignee) and optionally one project
CREATE TABLE IF NOT EXISTS tasks (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  profile_id INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  project_id INT UNSIGNED NULL,
  employee_id INT UNSIGNED NULL,
  requirement_id INT UNSIGNED NULL,
  status ENUM('todo','in_progress','review','done') NOT NULL DEFAULT 'todo',
  priority ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  start_date DATE NULL,
  due_date DATE NULL,
  estimate_hours DECIMAL(6,2) NULL,
  tags VARCHAR(255) NULL, -- lower-case, comma separated, no spaces (see src/lib/tags.js); filtered with FIND_IN_SET
  repeat_rule VARCHAR(16) NULL, -- daily | weekdays | weekly | biweekly | monthly | quarterly | yearly (see src/lib/recurrence.js)
  repeat_until DATE NULL,
  repeat_series_id INT UNSIGNED NULL, -- id of the first task of the series (plain column, no self-referencing key)
  repeat_next_id INT UNSIGNED NULL, -- the task that was created when this one was completed: it is made only once
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_tasks_project (project_id),
  KEY idx_tasks_employee (employee_id),
  KEY idx_tasks_status (status),
  KEY idx_tasks_due (due_date),
  KEY idx_tasks_owner (user_id),
  KEY idx_tasks_profile (profile_id),
  KEY idx_tasks_requirement (requirement_id),
  KEY idx_tasks_series (repeat_series_id),
  CONSTRAINT fk_tasks_owner FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tasks_profile FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_tasks_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  CONSTRAINT fk_tasks_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  CONSTRAINT fk_tasks_requirement FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Multiple attachments per task, each with its own sort order
CREATE TABLE IF NOT EXISTS task_attachments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  task_id INT UNSIGNED NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NULL,
  size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_att_task (task_id, sort_order),
  CONSTRAINT fk_att_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Attachments on requirements (same shape as task attachments)
CREATE TABLE IF NOT EXISTS requirement_attachments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  requirement_id INT UNSIGNED NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NULL,
  size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ratt_req (requirement_id, sort_order),
  CONSTRAINT fk_ratt_req FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Info vault: guidelines, credentials, links and notes per profile, each with ordered notes and attachments
CREATE TABLE IF NOT EXISTS info_items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  profile_id INT UNSIGNED NOT NULL,
  project_id INT UNSIGNED NULL,
  title VARCHAR(200) NOT NULL,
  category ENUM('guideline','credential','link','note','other') NOT NULL DEFAULT 'note',
  tags VARCHAR(255) NULL,
  summary VARCHAR(500) NULL,
  content LONGTEXT NULL,
  url VARCHAR(500) NULL,
  username VARCHAR(190) NULL,
  secret_enc TEXT NULL, -- AES-256-GCM, see lib/crypto.js
  secret_hint VARCHAR(120) NULL,
  pinned TINYINT(1) NOT NULL DEFAULT 0,
  color VARCHAR(16) NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_info_profile (profile_id, pinned, updated_at),
  KEY idx_info_owner (user_id),
  KEY idx_info_category (category),
  KEY idx_info_project (project_id),
  CONSTRAINT fk_info_owner FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_info_profile FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_info_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS info_notes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  info_id INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL DEFAULT '',
  content LONGTEXT NULL,
  format ENUM('text','table') NOT NULL DEFAULT 'text',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_info_notes (info_id, sort_order),
  CONSTRAINT fk_info_notes_item FOREIGN KEY (info_id) REFERENCES info_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS info_attachments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  info_id INT UNSIGNED NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NULL,
  size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_info_att (info_id, sort_order),
  CONSTRAINT fk_info_att_item FOREIGN KEY (info_id) REFERENCES info_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- In-app notifications per user (workspace events, reminders, security)
CREATE TABLE IF NOT EXISTS notifications (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body VARCHAR(500) NULL,
  href VARCHAR(255) NULL,
  entity_type VARCHAR(40) NULL,
  entity_id INT UNSIGNED NULL,
  profile_id INT UNSIGNED NULL, -- which profile the linked record lives in
  actor_id INT UNSIGNED NULL,
  dedupe_key VARCHAR(120) NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_notif_dedupe (user_id, dedupe_key),
  KEY idx_notif_user (user_id, read_at, created_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Multiple long text outputs per task, each with its own sort order
CREATE TABLE IF NOT EXISTS task_outputs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  task_id INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL DEFAULT '',
  content LONGTEXT NULL,
  format ENUM('text','table') NOT NULL DEFAULT 'text',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_out_task (task_id, sort_order),
  CONSTRAINT fk_out_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Discussion on a task. user_id carries no foreign key (deleting a user already cascades close to InnoDB's
-- table limit); author_name keeps the comment readable after the account is gone.
CREATE TABLE IF NOT EXISTS task_comments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  task_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  author_name VARCHAR(120) NOT NULL,
  body TEXT NOT NULL,
  edited_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tc_task (task_id, id),
  CONSTRAINT fk_tc_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Everybody a task is assigned to. Position 0 is the lead, who is also tasks.employee_id (so everything that
-- knew one assignee keeps working); the application keeps the two in step (src/lib/task-assignees.js).
CREATE TABLE IF NOT EXISTS task_assignees (
  task_id INT UNSIGNED NOT NULL,
  employee_id INT UNSIGNED NOT NULL,
  position SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, employee_id),
  KEY idx_tas_employee (employee_id),
  CONSTRAINT fk_tas_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_tas_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Subtasks of a task: a checklist with its own order.
CREATE TABLE IF NOT EXISTS task_checklist (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  task_id INT UNSIGNED NOT NULL,
  title VARCHAR(300) NOT NULL,
  done TINYINT(1) NOT NULL DEFAULT 0,
  done_by INT UNSIGNED NULL,
  done_at DATETIME NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tcl_task (task_id, sort_order),
  CONSTRAINT fk_tcl_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The recycle bin. A deleted record is stored here as a JSON snapshot (the row, everything that hangs off it and
-- which other rows pointed at it) and then really deleted, so no query elsewhere has to know about deleted rows.
-- Restoring puts everything back under the same ids. Attachment files stay on disk until the entry is purged.
CREATE TABLE IF NOT EXISTS trash (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  profile_id INT UNSIGNED NOT NULL,
  entity VARCHAR(32) NOT NULL,
  entity_id INT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  detail VARCHAR(255) NULL,
  deleted_by INT UNSIGNED NULL,
  deleted_by_name VARCHAR(120) NULL,
  deleted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  purge_at DATETIME NOT NULL,
  file_count INT UNSIGNED NOT NULL DEFAULT 0,
  snapshot LONGTEXT NOT NULL,
  KEY idx_trash_profile (profile_id, deleted_at),
  KEY idx_trash_purge (purge_at),
  CONSTRAINT fk_trash_profile FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Calendar entries that are not tasks: meetings, holidays, releases. Dates and times are "floating" (what the
-- clock on the wall says), so everybody sees the same 14:00. user_id is the profile's owner, like on tasks;
-- only the profile key cascades (deleting the owner deletes the profile, which takes the events along).
CREATE TABLE IF NOT EXISTS calendar_events (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  profile_id INT UNSIGNED NOT NULL,
  project_id INT UNSIGNED NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  location VARCHAR(200) NULL,
  all_day TINYINT(1) NOT NULL DEFAULT 1,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  color VARCHAR(16) NULL,
  created_by INT UNSIGNED NULL,
  created_by_name VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ce_profile_dates (profile_id, start_date, end_date),
  KEY idx_ce_project (project_id),
  CONSTRAINT fk_ce_profile FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_ce_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Time spent on a task. A row with started_at set and minutes = 0 is a running timer (one per user at most);
-- stopping it fills in the minutes. user_id carries no foreign key; user_name keeps the entry readable.
CREATE TABLE IF NOT EXISTS time_entries (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  task_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  user_name VARCHAR(120) NOT NULL,
  minutes INT UNSIGNED NOT NULL DEFAULT 0,
  spent_on DATE NOT NULL,
  note VARCHAR(255) NULL,
  started_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_te_task (task_id, spent_on),
  KEY idx_te_running (user_id, started_at),
  CONSTRAINT fk_te_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- "task_id waits for depends_on_id". Both live in the same profile; cycles are refused in code.
CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id INT UNSIGNED NOT NULL,
  depends_on_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, depends_on_id),
  KEY idx_td_dep (depends_on_id),
  CONSTRAINT fk_td_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_td_dep FOREIGN KEY (depends_on_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Who changed what on a task: one row per change (field, old and new value as readable text).
CREATE TABLE IF NOT EXISTS task_activity (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  task_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NULL,
  actor_name VARCHAR(120) NULL,
  action VARCHAR(32) NOT NULL,
  field VARCHAR(32) NULL,
  old_value VARCHAR(255) NULL,
  new_value VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ta_task (task_id, id),
  CONSTRAINT fk_ta_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sticky notes scoped to a module (dashboard / projects / employees / tasks), private to a user
CREATE TABLE IF NOT EXISTS notes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  module VARCHAR(40) NOT NULL,
  title VARCHAR(120) NULL,
  content TEXT NULL,
  color VARCHAR(16) NOT NULL DEFAULT 'yellow',
  pinned TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_notes_module (module, sort_order),
  KEY idx_notes_user (user_id),
  CONSTRAINT fk_notes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Web Push subscriptions (one row per browser/device that opted in), sent to by lib/push.js
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  endpoint VARCHAR(512) NOT NULL,
  p256dh VARCHAR(255) NOT NULL,
  auth VARCHAR(255) NOT NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP NULL,
  UNIQUE KEY uq_push_endpoint (endpoint),
  KEY idx_push_user (user_id),
  CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Draw boards: freehand drawings with images, saved as Fabric.js JSON; pasted images are attachments
CREATE TABLE IF NOT EXISTS draw_boards (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  profile_id INT UNSIGNED NOT NULL,
  project_id INT UNSIGNED NULL,
  title VARCHAR(200) NOT NULL,
  description VARCHAR(500) NULL,
  notes LONGTEXT NULL,
  data LONGTEXT NULL,
  thumbnail MEDIUMTEXT NULL,
  width INT NOT NULL DEFAULT 1280,
  height INT NOT NULL DEFAULT 800,
  background VARCHAR(16) NOT NULL DEFAULT '#ffffff',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_draw_boards_profile (profile_id, updated_at),
  KEY idx_draw_boards_project (project_id),
  CONSTRAINT fk_draw_boards_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_draw_boards_profile FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_draw_boards_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS draw_board_attachments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  board_id INT UNSIGNED NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NULL,
  size_bytes INT UNSIGNED NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_draw_board_att (board_id, sort_order),
  CONSTRAINT fk_draw_board_att FOREIGN KEY (board_id) REFERENCES draw_boards(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Instance-wide settings managed by admins (JSON documents keyed by name), e.g. "backgrounds"
CREATE TABLE IF NOT EXISTS app_settings (
  name VARCHAR(64) NOT NULL PRIMARY KEY,
  value JSON NOT NULL,
  updated_by INT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chat: friendships are one row per pair (requester asked first); accepted pairs can talk
CREATE TABLE IF NOT EXISTS friendships (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  requester_id INT UNSIGNED NOT NULL,
  addressee_id INT UNSIGNED NOT NULL,
  status ENUM('pending','accepted','blocked') NOT NULL DEFAULT 'pending',
  blocked_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at DATETIME NULL,
  UNIQUE KEY uq_friendships_pair (requester_id, addressee_id),
  KEY idx_friendships_addressee (addressee_id, status),
  CONSTRAINT fk_friendships_requester FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_friendships_addressee FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Conversations: one-to-one ('direct') or a named group with an owner
CREATE TABLE IF NOT EXISTS conversations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('direct','group') NOT NULL DEFAULT 'direct',
  title VARCHAR(80) NULL, -- groups only
  avatar_color VARCHAR(16) NOT NULL DEFAULT '#6366f1',
  avatar VARCHAR(255) NULL, -- group picture: 'preset:<key>' or 'upload:group:<id>:<stored file>'; NULL = coloured badge
  invite_code VARCHAR(16) NULL, -- groups: anyone signed in can join with /chat?join=CODE while it is set
  retention_days SMALLINT UNSIGNED NULL, -- disappearing messages: rows older than this are purged; NULL = keep
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_conversations_invite (invite_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  role ENUM('owner','admin','member') NOT NULL DEFAULT 'member', -- owner and admins rename a group, manage the invite link and remove people; only the owner changes roles
  last_read_message_id INT UNSIGNED NULL, -- read receipts and unread counts
  delivered_message_id INT UNSIGNED NULL, -- the newest message this member's device has received
  muted TINYINT(1) NOT NULL DEFAULT 0, -- no bell or push from this chat, and it stays out of the sidebar badge
  pinned_at DATETIME NULL, -- pinned chats sort first
  archived_at DATETIME NULL, -- tucked away under "Archived" until a new message arrives
  hidden_before_id INT UNSIGNED NULL, -- "delete chat" on my side: messages up to here are not shown to me
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id, user_id),
  KEY idx_conversation_members_user (user_id),
  CONSTRAINT fk_conversation_members_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_conversation_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT UNSIGNED NOT NULL,
  sender_id INT UNSIGNED NOT NULL,
  kind ENUM('text','system','sticker','location','call') NOT NULL DEFAULT 'text', -- system rows hold a JSON event (member added, renamed…); sticker = one big emoji in body; location = JSON { lat, lng, accuracy }; call = JSON { call_id, kind, status, duration }
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  edited_at DATETIME NULL,
  deleted_at DATETIME NULL, -- soft delete: the row stays as a "message deleted" placeholder, content and files go
  reply_to_id INT UNSIGNED NULL, -- quoted message (same conversation)
  forwarded TINYINT(1) NOT NULL DEFAULT 0, -- a copy forwarded from another chat
  KEY idx_messages_conversation (conversation_id, id),
  KEY idx_messages_reply (reply_to_id), -- no foreign key on purpose: a self-reference breaks MySQL's cascade limit when chats or users are deleted
  CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Photos, voice messages and files sent in chat (stored in the upload dir like other attachments)
CREATE TABLE IF NOT EXISTS message_attachments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  message_id INT UNSIGNED NOT NULL,
  kind ENUM('image','audio','file','video') NOT NULL DEFAULT 'file', -- photo, voice note, video clip, or any other file
  stored_name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NULL,
  size_bytes INT UNSIGNED NOT NULL DEFAULT 0,
  width INT UNSIGNED NULL,
  height INT UNSIGNED NULL,
  duration_ms INT UNSIGNED NULL, -- voice messages
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_message_attachments (message_id, sort_order),
  CONSTRAINT fk_message_attachments_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Emoji reactions on chat messages (one row per person and emoji)
CREATE TABLE IF NOT EXISTS message_reactions (
  message_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  emoji VARCHAR(16) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, user_id, emoji),
  KEY idx_message_reactions_user (user_id),
  CONSTRAINT fk_message_reactions_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_message_reactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Who a group message mentions (@Name / @everyone); drives the "@" unread signal and mention notifications
-- Reports users file against a message; the snapshot keeps the text and names even after the message is deleted or purged.
-- Reporter and sender ids carry no foreign key on purpose (users already cascade into many chat tables).
CREATE TABLE IF NOT EXISTS message_reports (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT UNSIGNED NOT NULL,
  message_id INT UNSIGNED NULL, -- NULL once the message row is gone (purged or the chat deleted)
  reporter_id INT UNSIGNED NOT NULL,
  sender_id INT UNSIGNED NOT NULL,
  reason VARCHAR(500) NOT NULL,
  snapshot JSON NOT NULL, -- { body, sender_name, reporter_name, conversation, attachments: [names] }
  status ENUM('open','dismissed','actioned') NOT NULL DEFAULT 'open',
  resolved_by INT UNSIGNED NULL,
  resolved_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_message_reports_status (status, created_at),
  KEY idx_message_reports_message (message_id),
  CONSTRAINT fk_message_reports_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_message_reports_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Voice / video calls between two people: the browsers talk WebRTC, the server only rings, relays signals and keeps this log.
-- No foreign keys on the people (users already cascade into many chat tables); a deleted account leaves dangling ids here.
CREATE TABLE IF NOT EXISTS calls (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT UNSIGNED NOT NULL,
  caller_id INT UNSIGNED NOT NULL, -- who started it
  callee_id INT UNSIGNED NULL, -- the other person of a direct call; NULL = a group call anyone in the group may join
  kind ENUM('audio','video') NOT NULL DEFAULT 'audio',
  status ENUM('ringing','active','ended','missed','declined','failed') NOT NULL DEFAULT 'ringing',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  answered_at DATETIME NULL,
  ended_at DATETIME NULL,
  message_id INT UNSIGNED NULL, -- the "call" line written into the chat when it is over
  KEY idx_calls_conversation (conversation_id, id),
  KEY idx_calls_open (status, created_at),
  CONSTRAINT fk_calls_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Who was rung / is in / left each call (group calls can have up to 8 people at once)
CREATE TABLE IF NOT EXISTS call_participants (
  call_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  status ENUM('ringing','joined','left','declined','missed') NOT NULL DEFAULT 'ringing',
  joined_at DATETIME NULL,
  left_at DATETIME NULL,
  PRIMARY KEY (call_id, user_id),
  KEY idx_call_participants_user (user_id, status),
  CONSTRAINT fk_call_participants_call FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS message_mentions (
  message_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (message_id, user_id),
  KEY idx_message_mentions_user (user_id),
  CONSTRAINT fk_message_mentions_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_message_mentions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
