# Task Portal

A local admin panel built with **Next.js (App Router, JavaScript)**, **Tailwind CSS v4** and **Node.js route handlers** on top of a **local MySQL** database.

Modules: **Projects → Requirements → Employees → Tasks**

- A project has many employees (many-to-many, with a per-project role) and many **requirements** (code `REQ-001…` assigned per project and editable, type, MoSCoW priority, status, stakeholder, description and acceptance criteria, ordered within the project). Tasks can be linked to the requirement they implement, and each requirement shows delivery progress from its tasks.
- An employee owns many tasks; a task optionally belongs to a project.
- Requirements can carry **attachments** too (same upload / paste / reorder / rename features as tasks).
- A task records a title, description, **multiple attachments** and **multiple long-text outputs** (autosaved a configurable few seconds after you stop typing — Preferences → Editing — or immediately with ⌘S / Save), each list with its own editable **sort order** (drag, arrows, or type a position). Attachments can be uploaded by file picker, drag-and-drop, or **pasting from the clipboard** (`⌘V` / `Ctrl+V` on the task page, or the Paste button) — screenshots get a timestamped name.

## Requirements

- Node.js 20+ (built with Node 24)
- MySQL 8+ running locally (Homebrew: `brew services start mysql`)

## Setup

```bash
npm install
cp .env.example .env.local     # adjust DB_USER / DB_PASSWORD if needed
npm run db:setup               # creates the `task_portal` database, tables and sample data
npm run dev                    # http://localhost:3000
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run db:setup` | Create DB + tables if missing, seed sample data when empty |
| `npm run db:reset` | Drop everything, recreate and reseed (also clears `uploads/`) |
| `node scripts/smoke-test.mjs` | End-to-end API test against a running dev server |
| `npm run lint` | ESLint |
| `npm run build && npm start` | Production build |

Environment variables (`.env.local`): `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `UPLOAD_DIR`.

## Notifications

The bell in the top bar shows unread notifications (polled every 30 s and on focus), with a toast, optional chime and optional desktop notification for new arrivals; the **Notifications** page lists everything grouped by day with unread / category filters, mark read/unread, delete, mark-all-read and clear-read. Notifications are generated server-side for: task created / assigned / status changed / completed, attachments added, requirement created / status / delivered, project created / status / completed / team changes (only when someone else — e.g. an admin in your workspace — made the change, except milestones like *completed* which you also see for your own actions), due-today / due-tomorrow / overdue task reminders (generated on demand, never duplicated), account changes (admins), and every sign-in to your account. Preferences → Notifications lets you mute categories (saved on your account) and choose chime / desktop alerts (this browser).

## Profile pictures

Every account has a picture: by default the "pro" badge (a crown tinted with the user's own colour, so people still differ at a glance), or one of 24 preset icons, plain initials, or an uploaded photo. Pictures are chosen in **Profile & password**: photos are square-cropped and resized to 256 px in the browser, checked by content on the server (2 MB) and served to signed-in users from `/api/avatars/user/:id`. Group chats get a picture the same way (any member can change it, a system line says who did; served from `/api/avatars/group/:id` to members only); the old file is removed whenever a picture changes and when an account or group is deleted.

## Accounts & roles

Sign-in is required for every page and API route (a request proxy redirects to `/login`). Sessions are server-side rows in the `sessions` table referenced by a signed, httpOnly cookie; passwords are hashed with scrypt.

| Role | Access |
| --- | --- |
| **admin** | Everything, plus the **Users** module: create accounts, set roles, disable, reset passwords, see each account's sign-in methods (passkeys, Google, 2FA), remove a lost passkey, unlink Google, reset two-factor authentication or sign the account out everywhere (the account keeps its password and is notified), delete (the last active admin and your own account are protected) |
| **user** | Projects, employees and tasks |

### Sharing a profile

A profile can be shared with other accounts from **Profiles → Share**. Pick one of your chat friends or type the
email of an existing account (or, when [email](#email) invitations are on, any address), choose a role, and the person gets an invitation (bell, push and a badge on
Profiles). Once they accept, the profile appears under **Shared with me** in the profile switcher and on their
Profiles page; while they are inside it a blue banner says whose profile it is and what they may do.

| Role | May |
| --- | --- |
| **Viewer** | read everything in the profile |
| **Editor** | also create and edit, and take parts off a record (a file, an output block, a project team member) |
| **Manager** | also delete whole records, invite people, change viewers and editors, remove them |
| **Owner** | everything; only the owner adds, changes or removes a manager |

- Members see the profile's projects, requirements, employees, tasks, board, calendar and draw boards. What a
  member creates belongs to the profile's owner, and the owner is notified about what members do.
- **The Info vault is never shared.** Inside someone else's profile the Info module disappears from the sidebar,
  search and counts, and its API answers 403 for every role.
- A member's own profiles stay their own: renaming, deleting or creating profiles always acts on the member's
  own workspace, never the sharer's.
- Members can leave at any time; removing a member takes effect on their next request, even if they are inside
  the profile at that moment.
- **Employees can be linked to accounts.** An employee record has a **Portal account** field (the owner or an
  active member of the profile). A record whose email equals a member's account email links by itself, when the
  record is saved or when the member joins; leaving or being removed clears the link. Linked people are told
  when a task is assigned to them ("… assigned you: …"), when its status changes, when they are added to a
  project, and they get the due and overdue reminders. Project and requirement events also reach the managers.
- **My tasks** (`/my-tasks`, with a sidebar count) lists everything assigned to you across your own profiles
  and the shared ones; opening a task from another profile switches to it first.

The rules are enforced in one place: the session puts the member's role on the user as `access`
(`owner | manager | editor | viewer`, with `owner_id` = the profile's owner and `home_id` = the member's own
workspace), and `handler()` checks `requiredAccess(method, path)` from `src/lib/sharing.js` for every workspace
route. Route code keeps scoping by `user.profile_id` and needs no sharing logic of its own.

**Profiles.** Each user can have several profiles (Profiles page, or the switcher at the top of the sidebar); a profile is a separate set of projects, requirements, employees and tasks — switch any time, mark one as default, and delete a profile to remove everything inside it (the last one cannot be deleted). Project codes and employee emails are unique per profile. Notifications remember which profile a record belongs to and switch to it when opened.

**Every user has their own workspace.** Projects, employees and tasks carry an owner; each account only ever sees and edits its own records (project codes and employee emails are unique per owner, and deleting a user deletes their workspace). Admins can step into another user's workspace from the **Workspace** menu in the top bar (or the briefcase action in the Users list) — an amber banner shows whose data they are looking at, and everything they create there belongs to that user.

Default accounts created by `npm run db:setup`: `admin@example.com / admin123` (admin) and `user@example.com / user123` (user). Change them from **Profile & password** in the account menu. Sticky notes are private per user. Sign out from the account menu or from the lock screen (which also clears the PIN lock, since signing back in requires the password).

**Passkeys.** Any user can add passkeys (Touch ID, Face ID, Windows Hello, a phone, or a security key) from **Profile & password → Passkeys** and then use **Sign in with a passkey** on the login page, with or without typing the email first. Passkeys are WebAuthn credentials (`@simplewebauthn`); the server stores only the public key, a signature counter and a name, and the challenge for each ceremony travels in a short-lived signed cookie. The relying party is the hostname of `APP_URL` (override with `WEBAUTHN_RP_ID`); passkeys need HTTPS except on `localhost`. Removing a passkey or changing the password does not affect the other.

**Two-factor authentication.** Any user can turn on an authenticator app (Google Authenticator, Authy, 1Password…) from **Profile & password → Two-factor authentication**: scan the QR code (or type the key), confirm a code, and save the ten one-time recovery codes. Password sign-ins then ask for the current 6-digit code or a recovery code, with an optional **trust this browser for 30 days**; five wrong codes end the attempt. Codes are RFC 6238 TOTP (SHA-1, 30 s, ±1 step, replay-protected); the secret is stored encrypted with `DATA_KEY`, recovery codes as SHA-256 hashes, trusted browsers as hashed random tokens. Users can issue new recovery codes (password), forget trusted browsers, or turn it off (password + code). Passkey and Google sign-ins are their own strong factor and skip the code. An admin can **reset 2FA** for an account that lost both phone and codes (Users module); the account is notified.

**Security page.** Account menu → **Security & sessions** (`/security`) lists every active session with its browser, OS, device class, IP, sign-in time, last activity and expiry, marks the current one, and lets the user terminate any other session or sign out all others at once. Below it, the **login history** shows the last 100 successful sign-ins and failed attempts (wrong password, wrong two-factor code, rejected passkey, disabled account) with method, device and IP; events are kept for 180 days. Admins get a **Sign out everywhere** action per account in the Users module.

**Continue with Google.** When `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set (an OAuth 2.0 web client whose authorised redirect URI is `APP_URL/api/auth/google/callback`), the login page shows a Google button. It never creates accounts: the Google identity is matched to an existing user by its stored id, or the first time by the verified Google email, which links the two. Users can also connect or disconnect Google from **Profile & password → Google account**. Every sign-in method ends in the same server-side session and sends the "new sign-in" security notification, which names the method.

Environment: `SESSION_SECRET` signs session cookies (regenerate it to sign everyone out); `DATA_KEY` encrypts Info secrets (keep it stable — changing it makes stored secrets unreadable); `COOKIE_SECURE=1` when serving over HTTPS; `APP_URL` is the public URL used for passkeys and the Google redirect.

**Handing a profile over.** In the share dialog the owner can make any active member the owner (crown). Everything inside goes with the profile; the owner's Info vault is private and moves to their own profile instead; the previous owner stays as manager, editor or viewer, or leaves. The profile keeps its id, so links and saved views keep working. Only the new owner can hand it back.

## Layout

| Area | Contents |
| --- | --- |
| **Left sidebar** | Brand banner, module navigation with live counts, dismissible tip card, collapse toggle (`⌘B`) |
| **Top bar** | Sidebar toggle, back/forward, breadcrumbs, **pin page** (`P`), global search (`⌘K`), **New** menu, split view, theme toggle, **show background only**, preferences, account menu (profile & password, show background only, lock, sign out) |
| **Pinned pages bar** | Strip under the header listing pinned pages (any list or detail page) for one-click switching; drag to reorder, × to unpin |
| **Right drawer** | Preferences (`⌘,`): light/dark/system theme, accent colour, corner radius, glass panels, background style + animation, density, **table style** (Classic: bordered rows with the search and filters in one bar; Modern: floating card rows, a large rounded search field, pill filters and buttons, a page header band tinted with the module colour, Modern cards and tabs, dashboard tiles, board columns and cards, the calendar grid, notification chips, profile tiles, the info search panel, modals, drawers, form controls and buttons, the sidebar, top bar, bottom bar, the Preferences drawer's sections, and the notes, timer, calculator and shortcuts tools), sidebar, bottom bar, pin bar, tip card, rows per page, timer lengths |
| **Bottom bar** | DB status + clock, **Sticky notes per module** (`⌘J`), Pomodoro timer with configurable focus/cooldown lengths and end-of-session alerts (pop-up, toast or silent; optional chime, desktop notification and auto-start of the next session), calculator, keyboard shortcuts (`?`), density toggle, back-to-top |
| **Info** | A per-profile vault for guidelines, credentials, links and reference notes, optionally **linked to a project** (filter by project; projects show an Info tab). Each item has a category, tags, summary, a main body, an optional credential block (URL, username and a secret **encrypted at rest with `DATA_KEY`**), plus any number of ordered **notes** and **attachments** (upload, drag-drop, paste). Revealing or copying a secret asks for your **lock-screen PIN or login password** (verified server-side, valid for 10 minutes per session, 5 wrong attempts pause it for a minute); revealed values hide after 30 s. Pin important items to the top. |
| **Tags in outputs / notes** | Type `@` in a paragraph to tag a person, project, task, requirement or Info item (search-as-you-type, arrow keys + Enter). The tag shows inside the paragraph as an inline link (`@Marcus Okafor`) that opens the record when clicked (⌘/Ctrl-click opens a new tab) and deletes as one unit; it is stored in the text as `@[Label](type:id)`. Tagged records are also listed as chips in a "Linked" strip under the block and on the collapsed row. Paragraphs paste as plain text, keep browser undo (⌘Z), and Enter inserts a line break. |
| **Tables in outputs / notes** | Every output (tasks) and note (Info) block is one document that mixes text and tables, edited in place: paragraphs are plain text, tables are live grids between them (Enter adds a row, Tab moves between cells, hover a row number or column header to delete it, hover the table for Copy-as-TSV and Delete). Add a table with **Insert table** (rows × columns picker at the caret), the **+ Table** handle that appears between paragraphs, or by pasting tabular data — a table copied from a web page or sheet, tab-separated text, CSV, Markdown, or a tab-separated header followed by one cell per line — which becomes a grid at the caret (toast to paste as text instead). Pasting a grid into a cell fills cells from there. Content is stored as Markdown (pipe tables), so it stays searchable, copyable and exportable; blocks saved in the earlier JSON table format are converted by `npm run db:setup`. |
| **Moderation** (admin) | Reported chat messages with a snapshot of each (delete the message for everyone or dismiss), every conversation's kind, members, message count, file size, retention and open reports (never the text), per-chat retention, full exports, deleting a conversation, an instance-wide cap on how long chat history is kept, the GIPHY / Tenor key that turns on GIF search in chat, and an optional TURN server for calls. The sidebar badge counts open reports. |
| **Backups** (admin) | Automatic backups of the database and the uploaded files. Shows whether the last backup is up to date, overdue or failed (with a sidebar badge and a notification to administrators when it fails), how many files are protected, the archives kept and the free disk space; **Back up now**, download or delete a single archive, and **Download everything** (one ZIP with the newest database archive, every uploaded file and restore notes) for keeping a copy off the server. |
| **Email** (admin) | The mail account the portal sends from (any SMTP server; the password is stored encrypted and never shown again), the address used in links, and three switches: password reset links, notification emails, invitations to people without an account. **Send test** tries the values in the form before they are saved; the log lists the last messages (recipient, subject, kind, result, never the text). Email is off until an administrator sets it up. |
| **Import** | On Tasks, Employees, Projects and Requirements: bring rows in from Excel, Google Sheets, Numbers or any CSV (drop a file or paste cells). Columns are matched to fields by their headers (English or Chinese) and can be changed; a check step shows what every row will become, with remarks, before anything is written. Projects and people that do not exist yet are added along the way, rows that exist already are skipped, dates in most formats are understood (with a day/month switch when a sheet is ambiguous), and status words such as "doing", "P0" or "paused" are mapped. **Undo** in the toast moves everything the import created to the recycle bin. |
| **Saved views** | On every list with filters (Tasks, Projects, Employees, Requirements, Info, Draw boards): **Views** in the table toolbar saves the current filters, search, date range and sort under a name. Come back to a view in one click or through `?view=<id>` in the address, mark one as the view the page opens with, share it with everyone in the profile (editors and up), update it after changing filters, or delete it. Views are per person and per profile. |
| **Time** | Hours logged in the profile for a period (this week, month, quarter, year, or any dates), grouped by person, project, task or day, with the share of the total, the count of entries and, for tasks and projects, logged against the estimate. Clicking a row drills down (a person or project to their tasks, a day to that day, a task to its page); a per-day bar chart; the entries themselves in a searchable table; CSV export of the totals and of the entries. |
| **Backgrounds** (admin) | Controls which of the 36 animated background styles users may pick (twenty-two are WebGL scenes rendered with three.js, loaded only when active) in Preferences, the default for new browsers, and an optional lock that forces the default on everyone. Live previews of every style. Stored instance-wide in `app_settings`. |
| **Draw Board** | Freehand boards built on Fabric.js: pen, eraser (drag over strokes to remove them), text, rectangles, ellipses and images — paste a screenshot with ⌘V, drop a file, or Insert image. Select to move, resize (corner handles) and rotate (top handle); bring forward / send backward, duplicate, undo/redo (50 steps), zoom. Export as PNG, JPEG, WebP or SVG at the board's native size. Each board has notes with `@` tags and can be linked to a project; boards are themselves taggable from outputs and notes. Drawings are saved as Fabric JSON (images referenced by their attachment URL) with a JPEG thumbnail for lists and reports. |
| **Info search** | `/info/search` (Search button on the Info page): every word must match somewhere; choose to search titles & summaries, content, notes and/or attachment names; filter by category, project, tag or pinned; results show highlighted snippets per matched field; recent searches are remembered and the query lives in the URL. |
| **Language** | English or 简体中文 — switch from the globe in the top bar, Preferences → Appearance, or the login page. The choice is saved in a cookie; dates follow the language. Server-generated texts (notifications, API errors) stay English. |
| **Board** | Kanban board of tasks grouped by status (or priority / assignee). Drag a card to another column to change that field, drag within a column to reorder, quick-add a task at the bottom of any column, click a card to open it and double-click to edit. Filters by text, project, assignee and priority; compact cards option. Reassigning a task — from the assignee selector on the task page or by dragging a card into another person's column on the board — asks for confirmation first, since it moves the work into someone else's workload (the workspace owner is notified when an admin does it on their behalf). |
| **Recycle bin** | Everything deleted in the active profile during the last 30 days: tasks (with files, outputs, checklist, comments, time, dependencies and history), projects (with requirements and the team list), requirements, employees (with their assignments), draw boards, Info items (owner only), events and single files. **Restore** puts a record back under the same id with everything that hung on it and re-links what pointed at it; **Delete for good** and **Empty the bin** remove entries and their files. Deleting shows an **Undo** toast. Open to the owner and managers of a profile. |
| **Timeline** | Tasks as bars from start to due date (a diamond when only a due date is set), grouped by project, assignee or flat, at week, month or quarter scale, with a today line, weekend shading, each project's own date range as a band, and arrows for dependencies (red when a task starts before the one it waits for ends). Drag a bar to move it, an edge to change one date, click a day on an undated row to place the task, click a bar to open it. View-only members can look but not drag. |
| **Calendar** | Tasks by due date in month, week or agenda view; filters by project / assignee / status, hide done, project deadlines as flags. Click a day for its task list (quick status change, edit, new task on that day), double-click or use the + on a day to create a task, and **drag a task to another day to reschedule it**. **Events** (meetings, holidays, releases) sit next to the tasks as coloured chips: all-day, multi-day or timed, with a place, notes, a colour and an optional project; add one with **New event**, click to edit, drag to another day. The owner and the person who added an event are reminded the day before and on the day. |
| **Split view** | Show 2 or 3 pages side by side (top-bar split menu or Preferences → Layout). The left pane is the main app; each extra pane embeds any page (modules, pinned pages, or “same as main”) and navigates independently. Drag the dividers to resize; pane pages and sizes persist. Pane header buttons: back, reload, swap with main, open in main, close. |
| **Background** | Thirty-six animated styles (CSS scenes such as *Aurora*, *Mesh*, *Orbs*, *Stars*, *Rain*, *Snow* and WebGL scenes such as *Galaxy*, *Earth*, *Ocean*, *Balloons*, *Hearts*, *Jellyfish*, *Ghosts*, *Portal*, *Wisps*, *Ringed planet*, *Nebula*, *Solar system*, *Grassland* with wind-swayed grass and grazing cows, *City drive* seen from the driver's seat: a bonnet in your accent colour, a steering wheel that follows the bends, buildings, lamps, trees and traffic sliding past at about 50 km/h, sunlit by day and neon-lit at night, *Neural network*: hundreds of glowing nodes drifting in depth, links that fade in and out as they pass, signals that hop from node to node and make them fire, and a soft glow around your mouse pointer, *Frozen peaks*: low-poly ice mountains under falling snow with big out-of-focus flakes up close, mist drifting through the valley, a glowing frozen lake, a lone climber in your accent colour on a rock pinnacle, and at night a moon, aurora and the odd shooting star; by day the same range in sunlight, *Lucky cat*: a plump beckoning cat with an accent-coloured collar and bow, a 發 plaque and gold at its feet, in front of a golden sunburst with red lanterns, while coins, notes and ingots rain down and sparkles twinkle; cream and sunlit by day, deep red and lamplit at night) or none; subtle / normal / vivid intensity, shuffle, pausable. **Show background only** (`⌘⇧.`, the top-bar wallpaper button, account menu, Preferences → Background, or the lock screen) fades every layer away so just the background plays; the first click or key press animates everything back. |
| **Lock screen** | Optional 4–8 digit PIN (Preferences → Lock screen), with its own appearance setting (follow app / light / dark). The animated background keeps playing behind a soft vignette (its palette follows the lock-screen appearance), and a **Show background only** button hides the clock and keypad until you click or press a key. Lock from the account menu, the bottom bar, or `⌘⇧L`; unlock with the keypad or keyboard. While locked the whole app (pages, split panes, drawers, bars) is unmounted from the DOM, not merely covered, and remounts on unlock. An inactivity auto-lock (1 min – 1 hour) locks the screen after no mouse/keyboard activity in any open tab of the app (activity is shared between tabs, so a forgotten background tab never locks the one you are using). The PIN is stored as a salted hash in the browser only — a convenience lock, not account security. |

Preferences and pinned pages persist in `localStorage`; sticky notes persist in MySQL.

## Tables

Every list uses the shared `DataTable` (`src/components/table/DataTable.js`): full width, sticky header, click-to-sort columns (asc → desc → off), a **Columns & sort** dropdown to choose displayed columns and set the default sort column and direction for that page (both remembered per table; a header click sorts for the current visit only), search, a **Dates** from/to range filter (pick the date field, type a range or use presets such as *Last 7 days* / *This month*), pagination, row selection with bulk delete, CSV export and density-aware spacing.

## Project structure

```
db/schema.sql                 MySQL schema
scripts/setup-db.mjs          create/seed/reset the database
scripts/smoke-test.mjs        API end-to-end test
uploads/                      task attachments (git-ignored)
src/app/                      App Router: (app)/ pages with the full chrome, embed/ bare pages for split-view panes, api/ route handlers
src/app/api/{projects,employees,tasks,attachments,outputs,notes,search,stats,health}
src/components/shell/         AppShell, Sidebar, TopBar, PinBar, BottomBar (+ tools), SplitView, TimerEngine, LockScreen, PreferencesDrawer, EmbedShell, AnimatedBackground
src/components/table/         DataTable
src/components/modules/       forms, list views, detail views, sortable attachments/outputs
src/components/ui/            buttons, controls, modal, drawer, popover, toast, badges…
src/lib/                      db pool, API helpers, module registry, preference store, utils
```

## API

All endpoints return `{ data }` or `{ error }`.

| Method | Path | Notes |
| --- | --- | --- |
| GET/POST | `/api/projects` | filters: `status`, `employee_id`, `q`; body may include `employee_ids[]` |
| GET/PUT/DELETE | `/api/projects/:id` | detail includes `employees[]` and `tasks[]` |
| POST/PUT/DELETE | `/api/projects/:id/employees` | add/update roles, replace all, remove one |
| GET/POST | `/api/requirements` | filters: `project_id`, `status`, `type`, `priority`, `q`; code is assigned per project |
| GET/PUT/DELETE | `/api/requirements/:id` | detail includes linked `tasks[]`; moving to another project re-codes it |
| PUT | `/api/projects/:id/requirements` | `{ order: [ids] }` reorder within the project |
| GET/POST | `/api/employees` | filters: `status`, `department`, `project_id`, `q`; body may include `project_ids[]` |
| GET/PUT/DELETE | `/api/employees/:id` | detail includes `projects[]` and `tasks[]` |
| GET | `/api/info/search` | `?q=&fields=title,content,notes,attachments&category=&project_id=&tag=&pinned=1` → items with `matches[]` snippets |
| GET / PUT | `/api/settings/backgrounds` | GET is public (`{ enabled[], default, locked }`); PUT is admin-only |
| GET/POST | `/api/drawboards` | filter `project_id`, `q`; lists omit the drawing data |
| GET/PUT/DELETE | `/api/drawboards/:id` | detail with `data` (Fabric JSON), `thumbnail`, `attachments[]`; PUT accepts fields, `data`, `thumbnail`; `?light=1` skips the big columns in the response |
| POST/PUT | `/api/drawboards/:id/attachments` | upload images placed on the board / reorder (files served via `/api/attachments/drawboard/:id`) |
| GET/POST | `/api/info` | filters: `category`, `tag`, `q`; lists never include secrets or bodies |
| GET/PUT/DELETE | `/api/info/:id` | detail with `notes[]` + `attachments[]`; PUT `secret` re-encrypts, `secret: null` clears |
| POST | `/api/info/:id/reveal` | `{ pin }` or `{ password }` (or nothing within the 10-minute window) → decrypted secret; 401 with `details.needs` otherwise |
| PUT | `/api/auth/pin` | `{ pin }` / `{ pin: null }` keeps a hashed copy of the lock-screen PIN on the account for re-verification |
| POST/PUT | `/api/info/:id/notes` · PUT/DELETE `/api/info-notes/:id` | notes, like task outputs |
| POST/PUT | `/api/info/:id/attachments` | uploads; files via `/api/attachments/info/:id` |
| GET / DELETE | `/api/trash` | entries of the active profile's recycle bin (`label`, `title`, `detail`, `deleted_by_name`, `days_left`, `file_count`) / empty it (files included). Owner and managers only; Info entries only for the owner |
| POST | `/api/trash/:id/restore` | put the record back (same id, children, links); 409 when what it belonged to is gone ("Restore … first") or its code/email was taken meanwhile |
| DELETE | `/api/trash/:id` | delete one entry for good |
| GET / POST | `/api/events` | calendar events that touch `?from=&to=` (`project_id` optional) / create `{ title, start_date, end_date?, all_day?, start_time?, end_time?, location?, description?, color?, project_id? }`; dates and times are floating (no time zones) |
| GET / PUT / DELETE | `/api/events/:id` | one event / change any subset (validated as a whole; sending only `start_date` keeps the length) / delete (owner and managers in a shared profile) |
| GET / POST | `/api/tasks/:id/time` | `{ entries[], total_minutes, running }` / log time `{ duration: "1h 30m" \| "0:45" \| "1.5", spent_on?, note? }` or `{ start: true }` to start a timer (my timer running elsewhere is stopped and its time kept) |
| PUT / DELETE | `/api/tasks/:id/time/:entryId` | correct my own entry / delete it (the owner and managers may delete anyone's) |
| GET / POST | `/api/time/running` · `/api/time/stop` | my running timer in any profile `{ running }` / stop it (at least a minute, at most a day) |
| GET | `/api/tasks/dependencies` | every `{ task_id, depends_on_id }` pair of the active profile (the timeline's arrows) |
| GET / POST | `/api/tasks/:id/dependencies` | `{ blocked_by[], blocking[], open }` / `{ depends_on_id }`: this task waits for that one (same profile; 409 for a duplicate or when it would close a loop) |
| DELETE | `/api/tasks/:id/dependencies/:dependsOnId` | remove one dependency |
| GET | `/api/tasks/tags` | tags used on tasks of the active profile with their counts |
| POST / PUT | `/api/tasks/:id/checklist` | `{ title }` adds a subtask (several lines add several, bullets and `[ ]` are stripped) / `{ order: [ids] }` reorders |
| PUT / DELETE | `/api/tasks/:id/checklist/:itemId` | `{ title?, done? }` rename or tick off (records who and when) / delete |
| GET / POST | `/api/tasks/:id/comments` | the discussion, oldest first (`mine`, `can_delete` per comment) / `{ body }` adds a comment (editors and up; `@[Name](employee:id)` tags notify the linked account, everyone else involved gets "commented on") |
| PUT / DELETE | `/api/tasks/:id/comments/:commentId` | the author edits (marked `edited_at`) / the author, the owner or a manager deletes |
| GET | `/api/tasks/:id/history` | who changed what: `action` (created, updated, attachment_added…), `field`, `old_value`, `new_value`, `actor_name` |
| GET | `/api/tasks/mine` | tasks assigned to me (employee records linked to my account) in every profile I can open; `?open=1` hides finished ones |
| PUT | `/api/tasks/reorder` | `{ order: [ids] }` sets board order (active profile only) |
| GET/POST | `/api/tasks` | filters: `project_id`, `employee_id`, `status`, `priority`, `tag`, `q` (title, description, tags), `due_from`, `due_to`, `has_due=1`; rows carry `comment_count`, `checklist_done` / `checklist_total`; rows carry `assignees[]` (lead first) and `assignee_names`; `assignee_ids: [employeeId, …]` sets everybody on the task (up to 12, the first leads and is mirrored in `employee_id`), the older `employee_id: X` swaps the lead and keeps the others, `employee_id: null` unassigns everyone; `?employee_id=` finds tasks a person leads or co-owns. Other fields include `start_date` (not after `due_date`), `estimate_hours`, `tags` (normalised: lower case, dashes, unique), `repeat_rule` (daily, weekdays, weekly, biweekly, monthly, quarterly, yearly) and `repeat_until`. Completing a repeating task (`status: done`, optionally `today: YYYY-MM-DD` from the browser) creates the next one once and returns it as `next_task`: dates are counted from the current due date and rolled forward until they are not in the past; title, description, project, assignee, requirement, priority, tags, estimate and the checklist (unticked) are copied |
| GET/PUT/DELETE | `/api/tasks/:id` | detail includes ordered `attachments[]` and `outputs[]` |
| POST/PUT | `/api/tasks/:id/attachments` | multipart upload (`files`), or `{ order: [ids] }` to reorder |
| GET/PATCH/DELETE | `/api/attachments/:id` | serve file (`?download=1`), rename / `{ position }`, delete |
| POST/PUT | `/api/tasks/:id/outputs` | create `{ title, content }`, or `{ order: [ids] }` |
| PUT/DELETE | `/api/outputs/:id` | `{ title, content, position }` |
| GET/POST | `/api/notes` | `?module=` filter |
| PUT/DELETE | `/api/notes/:id` | |
| GET | `/api/search?q=` | projects, employees, tasks |
| GET | `/api/stats` | dashboard numbers |
| GET | `/api/health` | DB connectivity (public); also `backup: { state: ok\|stale\|failed\|never, lastOkAt }` so monitoring notices a backup that stopped |
| GET / POST | `/api/backups` | admin: state, archives, policy, disk / back up now (201; 409 while one runs, 500 with the reason when it fails) |
| GET / DELETE | `/api/backups/:name` | admin: download one `db-YYYYMMDD-HHMMSS-<auto\|manual\|deploy>.sql.gz` / delete it |
| GET | `/api/backups/archive` | admin: streamed ZIP of the newest database archive plus every uploaded file and a restore README |
| GET / PUT | `/api/mail` | admin: `{ settings, log }` (never the password, only `password_set`) / save; an empty `password` keeps the stored one |
| POST | `/api/mail/test` | admin: `{ to?, …form values }` sends a test message with the values given (saved or not); 502 carries the mail server's reason |
| DELETE | `/api/profiles/:id/invites/:inviteId` | owner / manager: withdraw an invitation that was mailed to somebody without an account |
| POST | `/api/import` | `{ kind: tasks\|employees\|projects\|requirements, columns: [field\|null per column], rows: [[cells]], options: { dry, create_missing, skip_existing, date_order: "dmy"\|"mdy" } }`; with `dry` the preview (typed values and remarks per row), otherwise the clean rows are created (201 with `batch_id`, `created`, `skipped`). Up to 2000 rows; editor access |
| POST | `/api/import/:id/undo` | move everything a batch created to the recycle bin (the importer within a day, or a manager) |
| GET / POST | `/api/views` | `?module=` → my saved views in this profile plus the shared ones (`mine`, `is_default` per person) / `{ module, name, state: { filters, query, sort, date }, shared?, is_default? }` |
| PUT / DELETE | `/api/views/:id` | `{ name?, state?, shared?, is_default? }` (changing or deleting somebody else's view takes a manager; a default has to be your own) / delete |
| GET | `/api/time/report` | `?from=&to=` (default this month), `&group=person\|project\|task\|day`, `&project_id=`, `&user_id=` → `total_minutes`, `groups[]` (minutes, entries, people, tasks, share, estimate_minutes), `days[]`, `entries[]` (newest first, at most 5000), `people[]` |
| GET / POST | `/api/tokens` | my API tokens (prefix, scope, profile, last used, expiry, `requests_today`, `requests_total`, `limits`) / `{ name, scope: read\|write, profile_id?, days? }` → the token, shown once |
| DELETE | `/api/tokens/:id` | revoke |
| GET / POST | `/api/profiles/:id/webhooks` | owner / managers: the profile's webhooks and the event list / `{ url, events?: [...]\|"*" }` → the hook with its secret, shown once |
| PUT / DELETE | `/api/profiles/:id/webhooks/:hid` | `{ url?, events?, active? }` (turning a paused hook on clears its failures) / remove |
| POST | `/api/profiles/:id/webhooks/:hid/test` | send a `ping` now and answer with the delivery result |
| GET | `/api/profiles/:id/webhooks/:hid/deliveries` | the last 30 deliveries: status, attempts, response, error, next retry |
| POST | `/api/profiles/:id/transfer` | owner only: `{ user_id, keep_role: manager \| editor \| viewer \| null }` hands the profile to that active member; every record inside re-owns, the Info vault moves to the old owner's own profile, the old owner stays with `keep_role` or leaves |
| POST/PUT | `/api/requirements/:id/attachments` | multipart upload (`files`), or `{ order: [ids] }` |
| GET/PATCH/DELETE | `/api/attachments/:kind/:id` | `kind` = `task` or `requirement` (the old `/api/attachments/:id` still serves task files) |
| GET/DELETE | `/api/notifications` | list (`?unread=1`, `?limit=`) / clear read |
| GET | `/api/notifications/count` | unread count |
| PUT/DELETE | `/api/notifications/:id` | `{ read: true|false }` / delete |
| POST | `/api/notifications/read-all` | mark everything read |
| POST | `/api/auth/login` | `{ email, password, remember }` (public) |
| POST | `/api/auth/logout` | ends the session |
| GET | `/api/auth/me` | current user |
| PUT | `/api/auth/profile` | own name / avatar colour / `notification_prefs: { muted?: [categories], email?: boolean }` |
| PUT/POST/DELETE | `/api/auth/avatar` | `{ avatar: "preset:<key>" \| "initials" }` / multipart `file` photo / back to the default badge |
| GET | `/api/avatars/user/:id` · `/api/avatars/group/:id` | an uploaded picture (group pictures for members only) |
| PUT | `/api/auth/password` | `{ current_password, new_password }` |
| POST | `/api/auth/forgot` | public: `{ email }` mails a one-hour, single-use link to `/reset?token=…`. The answer is the same whether the address has an account or not; 3 links per account and 10 per IP an hour; 503 while reset by email is not set up |
| GET / POST | `/api/auth/reset` | public: `?token=` → `{ valid, email_hint, min_length }` / `{ token, password }` sets the password, signs every device out and mails a confirmation; 410 for a used or expired link |
| GET / POST | `/api/auth/join` | public: what the invitation behind `?token=` is about / `{ token, name, password }` creates the account (role user), joins the profile with the invited role and signs in; 410 for a dead link, 409 when the address got an account meanwhile |
| PUT | `/api/auth/workspace` | admin only: `{ user_id }` to work inside that user's workspace, `{ user_id: null }` to return |
| GET/POST | `/api/profiles` | your profiles with counts and `member_count` (`active_id` = current), plus `shared[]` (profiles others share with you) and `invites[]` (open invitations) / create |
| PUT/DELETE | `/api/profiles/:id` | rename, colour, description, `is_default` / delete with all its data |
| POST | `/api/profiles/:id/activate` | make it the active profile (cookie): one of your own, or one shared with you and accepted |
| GET / POST | `/api/profiles/:id/members` | who the profile is shared with (`can_manage`) / invite `{ user_id \| email, role: viewer\|editor\|manager }` (owner or manager; 404 unknown account, 409 already invited) |
| PUT / DELETE | `/api/profiles/:id/members/:userId` | change a role / remove a member or withdraw an invitation (managers cannot touch managers) |
| PUT / DELETE | `/api/profiles/:id/membership` | my own membership: `{ accept: true\|false }` answers an invitation / leave |
| GET | `/api/profiles/:id/candidates` | chat friends who are not in the profile yet, for the invite picker |
| GET/POST | `/api/users` | admin only |
| GET/PUT/DELETE | `/api/users/:id` | admin only; PUT accepts an optional `password` to reset |

## Chat

`/chat` is a text-and-photo chat between friends, one to one or in groups.

- **Friends by QR code.** Every account gets a friend code (`XXXX-XXXX-XXXX`, shown as a QR code on the Friends tab). Scanning it opens `/chat?add=CODE`, which previews the person and asks before sending the request; the code can also be typed in. Requests must be accepted before either side can message; you can cancel, decline, unfriend or block, and regenerate your code so old QR codes stop working.
- **Messages.** Text (up to 4000 characters), Enter to send, Shift+Enter for a new line, day separators, "Seen" read receipts and unread counts. The sidebar badge counts unread messages plus requests waiting for you.
- **Voice and video calls.** The phone and camera buttons in a chat header start a call. In a direct chat that rings the other person. In a group it opens a group call: every member is rung, the group shows a "call in progress" banner with a Join button and a green badge in the chat list, and people can join or leave while it runs (the last one out ends it). Group calls are a mesh — every participant streams to every other one directly — so they are capped at 8 people; the panel shows a tile per person. The chat line afterwards reads "Video call · 12:03 · 4 joined". They see a ringing card with Accept / Decline on whatever page of the portal they have open (the live stream now runs in the app shell), plus a bell and push entry "X is calling you" for when the portal is closed. Media goes browser to browser over WebRTC through public STUN servers; an administrator can add a TURN server on the Moderation page for networks where direct connections fail. The in-call panel (full screen on phones, a corner panel on desktop) shows the remote video or avatar, your own preview, a timer, mute, camera on/off, a front/back camera switch when the device has more than one, and hang up; it can be minimised to a small draggable pill so the app stays usable during the call, and the desktop panel can be dragged by its header. Every call leaves a line in the chat ("Video call · 3:12", "Missed voice call", "Declined"); a missed call counts as unread and raises a notification. The server only relays signals over the live stream and logs the call; no audio or video passes through it.
- **Stickers and GIFs.** The sticker button opens a panel with a built-in pack of 64 big emoji stickers (sent as their own message kind, shown large without a bubble) and a GIF tab. GIF search works once an administrator pastes a GIPHY or Tenor API key on the Moderation page: the key stays on the server, searches go through `/api/chat/gifs`, and a chosen GIF is downloaded by the server (10 MB cap, allow-listed hosts only) and stored like a photo, so recipients never contact the provider. Animated GIFs picked from your own files are sent untouched too.
- **Location.** The pin button (inside "+" on phones) asks the browser for your position, shows the coordinates and accuracy, and sends them once you confirm. Recipients see a location card; tapping it asks before opening Google Maps in a new tab with directions (the Maps app on phones). Nothing is loaded from Google until they say yes.
- **Video clips.** MP4, MOV and WebM files up to 15 MB each (checked by content, not by name) play inline with the browser's own controls, with byte-range seeking; pick them with the photo button or drop them onto the thread. Larger videos are refused with a clear message; other files keep the 20 MB limit.
- **Files.** The paperclip attaches any file (20 MB each, 25 MB per message, up to 8 attachments mixed with photos); files can also be dropped onto the thread or pasted. Each shows as a card with a type icon, name, size and a download button. Images, audio, MP4/WebM video, PDFs and plain text open in the browser; every other type is always served as a download with `nosniff`, so HTML or SVG uploads can never run as pages.
- **Photos.** Up to 8 per message with an optional caption, picked with the photo button, pasted, or dropped onto the thread. Big pictures are downscaled in the browser (longest edge 1920 px, JPEG) before upload; the server checks the bytes are a JPEG, PNG, GIF or WebP (10 MB each) and records the pixel size. Photos open in a full-screen viewer with keyboard navigation and download, and only the two members of the conversation can load them. Files live in the upload directory and are removed with the account.
- **Groups.** "New group" on the Chats tab names a group and picks friends; any member can add their own friends later, and anyone can leave (the owner hands over to the longest-standing admin, else member; the last member leaving deletes the group). Messages show the sender's name and avatar, system lines record joins, removals, renames and role changes, and "Seen by …" lists who has read your latest message.
- **Co-admins, invite links and ownership transfer.** From the member list the owner makes people admins (or removes them as admins); admins can rename the group, manage the invite link, remove plain members and delete anyone's message, but only the owner changes roles or removes an admin. Owner and admins can turn on an **invite link** (`/chat?join=CODE`, also shown as a QR code): anyone signed in to the portal can join with it, no friend request needed; reset it so leaked copies stop working, or turn it off. **Transfer ownership** is deliberate: the owner picks a member and must type their name; the previous owner stays on as an admin.
- **Disappearing messages.** The ⋮ menu (owner or admin in a group, either person in a direct chat) sets a window — 24 hours, 7, 30, 90 days or a year — after which messages are hard-deleted for everyone, files included; a system line announces the change and a timer icon marks the chat. An administrator can also cap history for the whole instance (see Moderation). Purges run when someone opens the chat, on a sweep at most every 10 minutes when chat lists load, and with the nightly reminders cron; open threads drop purged messages live.
- **Export.** "Export chat…" downloads what you can see: a plain-text transcript, JSON (messages with reactions, mentions and attachment details), or a ZIP that also holds every photo, voice note and file, streamed so large chats do not sit in memory.
- **Reports.** The ⋯ menu on someone else's message has **Report**: give a reason and an administrator sees a snapshot of the message (kept even if it is later deleted) on the Moderation page; the sender is not told who reported it.
- **Links and formatting.** URLs become links (new tab, no referrer), and light Markdown renders: `**bold**`, `*italic*` or `_italic_`, `~~strike~~`, `` `code` `` and fenced ``` blocks. ⌘B / ⌘I / ⌘E (Ctrl on Windows) wrap the selection in the composer. Only rendering changes; messages are stored as typed.
- **Mentions.** In a group, typing `@` opens a member picker (arrows, Enter or Tab to pick, Escape to close); `@Name` and `@everyone` render as chips, highlighted when they point at you. Mentions give the chat an "@" badge in the list until you read them, and the mentioned person gets a "mentioned you" notification instead of the plain new-message one. Edits recompute mentions and notify anyone newly mentioned.
- **Replies and forwarding.** The ⋯ menu on any message offers Reply (a quote of the original sits above your message; click it to jump to the original, even far back in history) and Forward (a copy, attachments included, into up to five chats you belong to, marked "Forwarded"). Escape cancels a pending reply.
- **Per-chat settings.** The ⋮ menu in a chat header pins it (pinned chats sort first), mutes it (no bell, no push, left out of the sidebar badge, its unread count shown in grey), archives it (tucked under "Show archived" until a new message brings it back), and — for direct chats — deletes it on your side only: the history up to now disappears for you, the other person keeps theirs, and the chat reappears when either of you writes again.
- **Presence.** A green dot marks people who have the portal open on any page (their live stream is connected); a chat header shows "Online" or "Last seen 5 minutes ago", and a group header counts who is online. Someone goes offline 30 seconds after their last tab closes.
- **Read receipts.** Every message you send carries a tick: ✓ sent, ✓✓ grey delivered (their browser has it), ✓✓ grey read by some, bright ✓✓ read by everyone in the chat. In groups, pressing the ticks lists who has read the message and who has not yet. Opening a chat with unread messages lands on an "Unread messages" line rather than the bottom. Receipts come from each member's read position, so nothing extra is stored.
- **Edit and delete.** Hover a message (tap on a phone) and open the ⋯ menu: your own text or caption can be edited inline (Enter saves, Esc cancels; ArrowUp in an empty composer edits your last message) and shows a small "edited" mark. Deleting your message — or, as a group owner, anyone's message in your group — removes its text, photos, voice note and reactions for everyone and leaves a "message deleted" placeholder so the thread keeps its shape. Deleted messages drop out of search, previews and unread counts.
- **Search.** The box above the chat list searches every conversation you belong to (2+ characters, newest first, matches highlighted); picking a result opens that chat at the message, flashes it, and shows a "Jump to latest messages" pill while you are looking at older history. The magnifier in a thread header searches that chat only, with previous/next arrows (Enter / Shift+Enter) and highlights in the bubbles.
- **Voice messages.** The microphone button (shown when the composer is empty and the browser can record) records up to 5 minutes with a live level meter; tick sends, cross discards. Recordings are WebM/Opus in Chrome, Edge, Firefox and Android, and MP4/AAC in Safari; the server checks the container by its bytes and keeps the duration. Voice bubbles have play/pause, a seekable bar, elapsed time and a 1×/1.5×/2× speed toggle; the file route honours byte ranges so seeking works everywhere.
- **Reactions.** Hover a bubble (or tap it on a phone) and press the smiley to pick one of eight quick reactions (👍 ❤️ 😂 😮 😢 🙏 🎉 🔥); double-click a text bubble for a quick ❤️. Reactions show as chips under the bubble with counts and who reacted, toggle off on a second click, update live for everyone, and notify the message's author once per reaction.
- **Typing indicators.** While someone writes, the thread shows "Ann is typing" with animated dots and the chat list shows "typing…" in place of the last message. Clients ping `/api/chat/conversations/:id/typing` at most every 2.5 seconds and send "stopped" after 4 seconds of quiet; nothing is stored, and a typer fades out after 6 seconds without a ping.
- **Live updates** come over Server-Sent Events (`/api/chat/stream`, events `message`, `message_updated`, `read`, `delivered`, `presence`, `friends`, `conversation`, `typing`, `reaction`); if the stream cannot connect the page polls every 5 seconds. New messages and friend requests also raise notifications (and pushes) in the **Chat** category, one bell entry per conversation.

Endpoints:

| Method | Path | Notes |
| --- | --- | --- |
| GET/POST | `/api/chat/friends` | my code, link and QR plus `friends[]`, `incoming[]`, `outgoing[]`, `blocked[]` / `{ code }` sends a request (auto-accepts when they asked first) |
| POST | `/api/chat/friends/code` | new friend code |
| GET | `/api/chat/friends/lookup?code=` | who owns a code and the `relation` (none, incoming, outgoing, friends, blocked, unavailable, self) |
| POST/DELETE | `/api/chat/friends/requests/:userId/accept` · `/api/chat/friends/requests/:userId` | accept / decline or cancel |
| DELETE | `/api/chat/friends/:userId` | unfriend (history stays, no new messages) |
| POST/DELETE | `/api/chat/friends/:userId/block` | block / unblock |
| GET/POST | `/api/chat/conversations` | my chats (direct and group) with members, unread counts and last message / `{ user_id }` opens the direct chat with a friend |
| POST | `/api/chat/groups` | `{ title, member_ids[] }` creates a group with you as owner (members must be your friends) |
| GET/PUT/DELETE | `/api/chat/conversations/:id` | details with `members[]` (each with `role` owner/admin/member, `online`, `last_seen_at`, read and delivered pointers), `my_role`, `retention_days`, `retention_cap` and (managers only) `invite_code` / rename a group (owner or admin) / leave a group, or delete a direct chat on your side |
| PUT/POST/DELETE | `/api/chat/conversations/:id/avatar` | group picture: preset / multipart `file` / remove (any member) |
| POST | `/api/chat/conversations/:id/members` | `{ user_ids[] }` adds your friends to a group |
| DELETE/PUT | `/api/chat/conversations/:id/members/:userId` | remove someone (owner removes anyone, admins remove plain members) / `{ role: "admin" | "member" }` promote or demote, `{ role: "owner", confirm: "<their name>" }` transfer ownership (owner only) |
| GET/POST/DELETE | `/api/chat/conversations/:id/invite` | the group's invite link `{ code, link, qr }` / create or reset it / turn it off (owner or admin) |
| GET/POST | `/api/chat/invites/:code` | preview `{ group, relation: none|member|full }` / join the group behind an invite link |
| PUT | `/api/chat/conversations/:id/retention` | `{ days: null|1|7|30|90|365 }` disappearing messages (owner/admin in groups, either person in a direct chat) |
| GET | `/api/chat/conversations/:id/export` | `?format=txt|json|zip` download of what you can see in the chat |
| POST | `/api/chat/messages/:id/report` | `{ reason }` reports someone else's message to the administrators |
| GET | `/api/chat/admin/overview` | admin: instance settings, totals and every conversation's members, counts, size, retention and open reports (no message text) |
| PUT | `/api/chat/admin/settings` | admin: `{ max_retention_days?, gif_provider?, gif_api_key?, turn_url?, turn_username?, turn_credential? }` — history cap (purges at once), the GIF search key and the TURN server (secrets stored server-side, reported only as `…_set`) |
| GET | `/api/chat/admin/reports` | admin: reports (`?status=open|resolved|all`) with the snapshot taken when they were filed |
| PUT | `/api/chat/admin/reports/:id` | admin: `{ action: "dismiss" | "delete_message" }` |
| DELETE | `/api/chat/admin/conversations/:id` | admin: delete any conversation with its files (members are told live) |
| PUT / GET | `/api/chat/admin/conversations/:id/retention` · `/export` | admin: set a chat's retention from outside it / export any conversation in full |
| GET/POST | `/api/chat/conversations/:id/messages` | `?before=&limit=` pages backwards, `?around=<id>` loads a window round one message / JSON `{ body, reply_to?, mentions?[], mention_all? }`, `{ sticker }`, `{ location: { lat, lng, accuracy? } }`, `{ gif_url }`, or multipart `body` (+ `reply_to`, `mentions` JSON, `mention_all`) + `files[]` (photos, video clips ≤ 15 MB, other files) or `voice` + `duration` (ms); messages carry `kind` (text/system/sticker/location), `attachments[]` (`kind` image/audio/video/file), `reply_to` (quote), `forwarded` and `mentions[]`; conversation rows carry `mention_unread`, `last_videos` and `gif_search` |
| GET | `/api/chat/photos/:id` | a photo, voice note or file, for members of its conversation (`?download=1`; byte ranges; inline only for safe media types) |
| PUT | `/api/chat/conversations/:id/settings` | `{ muted?, pinned?, archived? }` — my own settings for that chat |
| POST | `/api/chat/conversations/:id/delivered` | `{ message_id }` my device received messages up to there (senders see ✓✓) |
| POST | `/api/chat/conversations/:id/read` | `{ message_id }` (must belong to the chat) marks read up to that message; members' `last_read_message_id` drive per-message receipts |
| POST | `/api/chat/calls` | `{ conversation_id, kind: audio\|video }` rings the other person of a direct chat, or opens a group call and rings every member (201; 409 when you are already in a call, or a call is already on in the group) |
| POST | `/api/chat/calls/:id/join` · `/leave` | group calls: join (the answer lists who is in it; the newcomer offers to each) / leave (the last one out ends it); up to 8 people |
| GET | `/api/chat/calls/ice` | ICE servers for the browser: public STUN plus the admin's TURN server |
| GET | `/api/chat/calls/:id` | the call's state |
| POST | `/api/chat/calls/:id/accept` · `/decline` | the person being called picks up (active) or says no |
| POST | `/api/chat/calls/:id/end` | hang up; while ringing the caller giving up marks it missed; `{ reason: "failed" }` logs a call that could not connect |
| POST | `/api/chat/calls/:id/signal` | `{ to?, signal: { type: offer\|answer\|candidate, … } }` relayed to one participant over the live stream (`to` is required in a group; `call` events: `ring`, `accepted`, `started`, `participant_joined`, `participant_left`, `signal`, `ended`) |
| GET | `/api/chat/gifs` | `?q=` (trending when empty) `&pos=` next page; `{ configured, provider, items[], next }` — `configured: false` until an admin sets a key |
| GET | `/api/chat/search` | `?q=` (2+ chars), optional `?c=<conversation>` and `?before=<message id>`; text messages in your conversations, newest first |
| POST | `/api/chat/messages/:id/forward` | `{ conversation_ids[] }` (up to 5) copies the message, files included, into chats you belong to |
| PUT/DELETE | `/api/chat/messages/:id` | `{ body }` edits your own message (sets `edited_at`) / soft-deletes yours or, as group owner or admin, anyone's (`deleted_at`, content and files removed) |
| POST | `/api/chat/messages/:id/reactions` | `{ emoji }` toggles one of the quick reactions; messages carry `reactions[]` (`emoji`, `count`, `user_ids`, `names`) |
| POST | `/api/chat/conversations/:id/typing` | `{ typing: true|false }` relayed live to the other members, never stored |
| GET | `/api/chat/stream` | Server-Sent Events for the signed-in user (also `purged` when retention removes messages) |

## Mobile and PWA

The layout adapts down to phone widths: the sidebar becomes an off-canvas drawer (hamburger
in the top bar, tap outside or a module to close), search opens full-screen, the header keeps
only the essentials, tables and the kanban board scroll sideways inside their cards, and the
calendar scrolls rather than squeezing. The shell uses dynamic viewport units and safe-area
insets so it sits correctly under notches and above the home indicator when installed.

It is installable as a PWA: `src/app/manifest.js` serves the web app manifest, `public/icons/`
holds the 192/512 and maskable icons, and `public/sw.js` is a deliberately conservative service
worker (registered in production only by `PwaRegister`). It never caches pages or API responses;
it serves `/offline` when a navigation fails and caches immutable `/_next/static` assets. When a
browser offers installation, an **Install app** entry appears in the account menu; on iOS use
Share → Add to Home Screen. `/offline`, `/manifest.webmanifest` and `/sw.js` are public routes.

## Reports and PDF

Every list and detail page has a **Report** button that opens a print-ready document in a new
tab (`/report/<module>` for the whole module, `/report/<module>/<id>` for one record). The left
panel toggles sections and, for tasks, Info items and requirements, picks which outputs, notes
and attachments to include; images are embedded so they land in the PDF. **Save as PDF** uses
the browser's print dialog, so nothing is generated on the server. Module reports can be
filtered by status and grouped by project or department. Secrets are never included.

## Bottom-bar tools

Notes, Timer, Calculator and Shortcuts open as a popover above the bottom bar. Each has an
**Expand** button that turns it into a full-screen workspace with its own sidebar: Notes gets
search, a module filter and the list of every note beside a wall of all notes (or one note in
a large editor); Timer gets a big clock with durations and alert settings beside it; Calculator
gets a large keypad with its history beside it. "Collapse to panel" returns to the popover; the
choice is remembered. On phones tools always open as the workspace.

## Email

Email is optional and off by default. An administrator opens **Email**, enters an SMTP account, sends a test
and turns it on. The settings live in `app_settings` (the password encrypted with `DATA_KEY`); `SMTP_HOST`,
`SMTP_PORT`, `SMTP_SECURE` (`starttls` \| `tls` \| `none`), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` and
`SMTP_FROM_NAME` work as a fallback until something is saved on the page. Links in messages use the portal
address from the page, else `APP_URL`, else the address the portal was last opened at.

- **Password reset.** With email on, the sign-in page shows **Forgot password?**. The link works once and for one
  hour, only its SHA-256 hash is stored (`mail_tokens`), using it signs every device out, and the account gets a
  confirmation by mail and in the bell. Unknown addresses get the same answer and no mail. Two-factor
  authentication still applies at the next sign-in.
- **Notification emails.** The entries that wait for a person also go out by email: task assigned, mention,
  unblocked, due / overdue, event reminder, profile invitation, role change, access removed, a sign-in from a
  browser the account has not used before, sign-in method changes, a failed backup, chat mentions. Each person
  can turn theirs off under Preferences → Notifications → **Email**; muted categories are never mailed. The
  button in a message goes through `/n/:id`, which switches to the right workspace first.
- **Invitations.** Sharing a profile with an address that has no account mails a 7-day link to `/join`, where the
  person picks a name and a password and lands in the shared workspace with the invited role (account role
  *user*). Pending invitations are listed in the share dialog and can be withdrawn; inviting the same address
  again replaces the link. An administrator can switch this off, then only administrators create accounts.
- **Limits and records.** At most 40 messages per recipient an hour, 10 join invitations per inviter an hour and
  25 pending per profile. `mail_log` keeps recipient, subject, kind and result for 60 days, never the text.
  Messages are in English.

## API tokens and webhooks

**API tokens** (Security → API tokens) let scripts and other tools use the same JSON API as the app. A token is
`tp_…`, shown once, stored as a hash, and works inside one profile (the default one unless chosen) as the person
who made it: `curl -H "Authorization: Bearer tp_…" https://your-portal/api/tasks`. A *read* token only reads;
a *read & write* token creates and changes records like the person could (sharing roles still apply). No token
can use account, user, mail, backup, chat or profile-management routes, and the Info vault stays locked.
Tokens can expire, are listed with their last use, and are revoked with one click.

Every token is rate limited: 60 requests a minute and 5000 a day (UTC), counted per token in the database, so
several server processes agree. Each answer carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and
`X-RateLimit-Reset` (unix seconds); over the limit the API answers `429` with `Retry-After`. Requests over the
limit still count. An address that sends 30 wrong tokens within ten minutes waits ten minutes before any bearer
request from it is looked at again (browser sessions are not affected). `API_RATE_PER_MINUTE` and
`API_RATE_PER_DAY` change the limits. The Security page shows each token's requests today and in all.

**Webhooks** (Profiles → the webhook button on a profile; owner and managers) tell another system what happens
in a profile: `task.created`, `task.updated`, `task.completed`, `task.deleted`, `task.comment`,
`project.created|updated|deleted`, `requirement.created|updated|deleted`. Each event is one JSON `POST`
`{ event, at, profile, actor, data }` with headers `X-TaskPortal-Event`, `X-TaskPortal-Delivery` and
`X-TaskPortal-Signature: sha256=<HMAC-SHA256 of the raw body with the hook's secret>` (the secret is shown once).
A delivery that gets no 2xx within 8 seconds is retried after 1, 5 and 25 minutes by the scheduler
(`/api/cron/reminders`); after 20 failures in a row the hook pauses itself and its owner is told. **Send test**
posts a `ping`; the last 30 deliveries are listed per hook and kept for 14 days. Addresses inside the server's
own network are refused in production (`WEBHOOK_ALLOW_LOCAL=1` lifts that).

## Push notifications

Preferences → Notifications → **Push (this device)** subscribes the browser with Web Push
(VAPID). Every notification that lands in the bell is also pushed to opted-in devices, and
tapping it opens the linked page. On iPhone the app must be added to the Home Screen first.

Chat retention is purged by the same cron call (`chat_purged` in its response). Reminders for tasks due today, tomorrow or overdue are generated by `/api/cron/reminders`,
which a cron job calls with `CRON_SECRET` so pushes go out even when nobody has the app open
(the bell still generates them on demand while you browse). Configure `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and `CRON_SECRET`; without the VAPID keys push is
simply off. Subscriptions live in `push_subscriptions`; dead ones are pruned when the push
service reports them gone.

## Deployment

Pushing to `main` runs lint and build in GitHub Actions, then deploys over SSH to a
Hostinger VPS running CloudPanel: pull the commit, install, build into a staging
directory, run migrations, swap the build in, restart pm2 and health-check. Any
failure restores the previous release.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the server layout and setup.

Deployments run `node scripts/setup-db.mjs --no-seed`, which applies the schema and
migrations only — never the demo logins or sample data. On an empty database it creates
the first admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. `npm run db:reset` drops every
table and must never run on a server.

### Recycle bin

`DELETE` on a task, project, requirement, employee, draw board, Info item, event or attachment answers
`{ id, trash_id }`: `src/lib/trash.js` writes a JSON snapshot of the row, of every row that dies with it and of the
ids that pointed at it into the `trash` table, then deletes the record for real (one transaction). No other query has
to know about deleted rows. Attachment files stay on disk until the entry is purged: after `TRASH_DAYS` (30) by the
reminders cron, by **Delete for good** / **Empty the bin**, or when the whole profile or account is deleted. A new
record type joins the bin by adding a spec (table, children, links, references) to `SPECS` in that file.

### Backups and restore

`scripts/backup.mjs` backs up the database and the uploaded files. It runs **once a day** (the reminders cron
endpoint starts it when the last good backup is more than 20 hours old), **before the migrations of every
deploy**, and on demand from the **Backups** page or the command line:

```bash
node --env-file=.env scripts/backup.mjs            # add --engine node to force the built-in dumper
```

- **Database:** a gzip-compressed SQL dump in `BACKUP_DIR/db`, made with `mysqldump` (single transaction, no
  table locks) or, when that tool is missing or fails, a built-in dumper. Login sessions are never included.
  Every archive is read back and checked before it counts, and `status.json` records the outcome.
- **Files:** `BACKUP_DIR/files` mirrors `UPLOAD_DIR` with hard links, so it costs no disk space; a file the app
  deletes stays restorable for `BACKUP_FILE_GRACE_DAYS` (30). On another filesystem the files are copied instead,
  up to `BACKUP_FILES_COPY_MAX_MB` (2048).
- **Rotation:** everything from the last 48 hours, then the newest per day for `BACKUP_KEEP_DAILY` (14) days, per
  week for `BACKUP_KEEP_WEEKLY` (8) weeks and per month for `BACKUP_KEEP_MONTHLY` (6) months.
- **Where:** `BACKUP_DIR`, by default a `backups` folder next to `UPLOAD_DIR`, readable by the site user only.
  That is the same server as the app: it undoes mistakes and bad migrations, not the loss of the server. Use
  **Download everything** on the Backups page (or copy `BACKUP_DIR`) to keep a copy elsewhere, together with `.env`.

Restore into an empty database (a database that already has tables is refused without `--force`; use
`--database <name>` to restore next to the live one and look inside a backup first):

```bash
node --env-file=.env scripts/restore.mjs /path/to/backups/db/db-20260917-020500-auto.sql.gz
cp -n /path/to/backups/files/* "$UPLOAD_DIR"/
```

Keep the same `DATA_KEY`. Everybody signs in again afterwards.

Two values in the server's `.env` are permanent: `DATA_KEY` decrypts stored Info
credentials and `SESSION_SECRET` signs sessions. Attachments live in `UPLOAD_DIR`
outside the checkout. Back up the database, the uploads and that env file together.

## Adding a module

Register it in `src/lib/modules.js` (label, route, icon, colour) — the sidebar, breadcrumbs, sticky-note scopes and the **New** menu pick it up automatically — then add its table to `db/schema.sql`, route handlers under `src/app/api/<module>/`, and list/detail views under `src/components/modules/`.

## Translations

UI strings are translated at render time with `const tr = useT()` (from `src/lib/i18n.js`) and English text as the key: `tr("New task")`, `tr("{n} rows", { n })`. Unknown keys fall back to English, so add the English string to the `zhCN` map in `src/lib/i18n.js` to translate it. The chosen language is stored in the `ap_locale` cookie (read by the root layout, so the server renders the right language) and switching reloads the page. Dates and relative times follow the language through `setDateLocale` in `src/lib/utils.js`.
