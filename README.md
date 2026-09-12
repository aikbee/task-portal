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

## Accounts & roles

Sign-in is required for every page and API route (a request proxy redirects to `/login`). Sessions are server-side rows in the `sessions` table referenced by a signed, httpOnly cookie; passwords are hashed with scrypt.

| Role | Access |
| --- | --- |
| **admin** | Everything, plus the **Users** module: create accounts, set roles, disable, reset passwords, delete (the last active admin and your own account are protected) |
| **user** | Projects, employees and tasks |

**Profiles.** Each user can have several profiles (Profiles page, or the switcher at the top of the sidebar); a profile is a separate set of projects, requirements, employees and tasks — switch any time, mark one as default, and delete a profile to remove everything inside it (the last one cannot be deleted). Project codes and employee emails are unique per profile. Notifications remember which profile a record belongs to and switch to it when opened.

**Every user has their own workspace.** Projects, employees and tasks carry an owner; each account only ever sees and edits its own records (project codes and employee emails are unique per owner, and deleting a user deletes their workspace). Admins can step into another user's workspace from the **Workspace** menu in the top bar (or the briefcase action in the Users list) — an amber banner shows whose data they are looking at, and everything they create there belongs to that user.

Default accounts created by `npm run db:setup`: `admin@example.com / admin123` (admin) and `user@example.com / user123` (user). Change them from **Profile & password** in the account menu. Sticky notes are private per user. Sign out from the account menu or from the lock screen (which also clears the PIN lock, since signing back in requires the password).

Environment: `SESSION_SECRET` signs session cookies (regenerate it to sign everyone out); `DATA_KEY` encrypts Info secrets (keep it stable — changing it makes stored secrets unreadable); `COOKIE_SECURE=1` when serving over HTTPS.

## Layout

| Area | Contents |
| --- | --- |
| **Left sidebar** | Brand banner, module navigation with live counts, dismissible tip card, collapse toggle (`⌘B`) |
| **Top bar** | Sidebar toggle, back/forward, breadcrumbs, **pin page** (`P`), global search (`⌘K`), **New** menu, split view, theme toggle, preferences, account menu (profile & password, lock, sign out) |
| **Pinned pages bar** | Strip under the header listing pinned pages (any list or detail page) for one-click switching; drag to reorder, × to unpin |
| **Right drawer** | Preferences (`⌘,`): light/dark/system theme, accent colour, corner radius, glass panels, background style + animation, density, sidebar, bottom bar, pin bar, tip card, rows per page, timer lengths |
| **Bottom bar** | DB status + clock, **Sticky notes per module** (`⌘J`), Pomodoro timer with configurable focus/cooldown lengths and end-of-session alerts (pop-up, toast or silent; optional chime, desktop notification and auto-start of the next session), calculator, keyboard shortcuts (`?`), density toggle, back-to-top |
| **Info** | A per-profile vault for guidelines, credentials, links and reference notes, optionally **linked to a project** (filter by project; projects show an Info tab). Each item has a category, tags, summary, a main body, an optional credential block (URL, username and a secret **encrypted at rest with `DATA_KEY`**), plus any number of ordered **notes** and **attachments** (upload, drag-drop, paste). Revealing or copying a secret asks for your **lock-screen PIN or login password** (verified server-side, valid for 10 minutes per session, 5 wrong attempts pause it for a minute); revealed values hide after 30 s. Pin important items to the top. |
| **Tags in outputs / notes** | Type `@` in a paragraph to tag a person, project, task, requirement or Info item (search-as-you-type, arrow keys + Enter). The tag shows inside the paragraph as an inline link (`@Marcus Okafor`) that opens the record when clicked (⌘/Ctrl-click opens a new tab) and deletes as one unit; it is stored in the text as `@[Label](type:id)`. Tagged records are also listed as chips in a "Linked" strip under the block and on the collapsed row. Paragraphs paste as plain text, keep browser undo (⌘Z), and Enter inserts a line break. |
| **Tables in outputs / notes** | Every output (tasks) and note (Info) block is one document that mixes text and tables, edited in place: paragraphs are plain text, tables are live grids between them (Enter adds a row, Tab moves between cells, hover a row number or column header to delete it, hover the table for Copy-as-TSV and Delete). Add a table with **Insert table** (rows × columns picker at the caret), the **+ Table** handle that appears between paragraphs, or by pasting tabular data — a table copied from a web page or sheet, tab-separated text, CSV, Markdown, or a tab-separated header followed by one cell per line — which becomes a grid at the caret (toast to paste as text instead). Pasting a grid into a cell fills cells from there. Content is stored as Markdown (pipe tables), so it stays searchable, copyable and exportable; blocks saved in the earlier JSON table format are converted by `npm run db:setup`. |
| **Backgrounds** (admin) | Controls which of the 17 animated background styles users may pick (three are WebGL scenes rendered with three.js, loaded only when active) in Preferences, the default for new browsers, and an optional lock that forces the default on everyone. Live previews of every style. Stored instance-wide in `app_settings`. |
| **Draw Board** | Freehand boards built on Fabric.js: pen, eraser (drag over strokes to remove them), text, rectangles, ellipses and images — paste a screenshot with ⌘V, drop a file, or Insert image. Select to move, resize (corner handles) and rotate (top handle); bring forward / send backward, duplicate, undo/redo (50 steps), zoom. Export as PNG, JPEG, WebP or SVG at the board's native size. Each board has notes with `@` tags and can be linked to a project; boards are themselves taggable from outputs and notes. Drawings are saved as Fabric JSON (images referenced by their attachment URL) with a JPEG thumbnail for lists and reports. |
| **Info search** | `/info/search` (Search button on the Info page): every word must match somewhere; choose to search titles & summaries, content, notes and/or attachment names; filter by category, project, tag or pinned; results show highlighted snippets per matched field; recent searches are remembered and the query lives in the URL. |
| **Language** | English or 简体中文 — switch from the globe in the top bar, Preferences → Appearance, or the login page. The choice is saved in a cookie; dates follow the language. Server-generated texts (notifications, API errors) stay English. |
| **Board** | Kanban board of tasks grouped by status (or priority / assignee). Drag a card to another column to change that field, drag within a column to reorder, quick-add a task at the bottom of any column, click a card to open it and double-click to edit. Filters by text, project, assignee and priority; compact cards option. Reassigning a task — from the assignee selector on the task page or by dragging a card into another person's column on the board — asks for confirmation first, since it moves the work into someone else's workload (the workspace owner is notified when an admin does it on their behalf). |
| **Calendar** | Tasks by due date in month, week or agenda view; filters by project / assignee / status, hide done, project deadlines as flags. Click a day for its task list (quick status change, edit, new task on that day), double-click or use the + on a day to create a task, and **drag a task to another day to reschedule it**. |
| **Split view** | Show 2 or 3 pages side by side (top-bar split menu or Preferences → Layout). The left pane is the main app; each extra pane embeds any page (modules, pinned pages, or “same as main”) and navigates independently. Drag the dividers to resize; pane pages and sizes persist. Pane header buttons: back, reload, swap with main, open in main, close. |
| **Background** | Nine animated styles — *Aurora*, *Mesh*, *Orbs*, *Bubbles*, *Stars*, *Waves*, *Hexagons*, *Sunrise*, *Grid* — or none; subtle / normal / vivid intensity, shuffle, pausable |
| **Lock screen** | Optional 4–8 digit PIN (Preferences → Lock screen), with its own appearance setting (follow app / light / dark). Lock from the account menu, the bottom bar, or `⌘⇧L`; unlock with the keypad or keyboard. While locked the whole app (pages, split panes, drawers, bars) is unmounted from the DOM, not merely covered, and remounts on unlock. An inactivity auto-lock (1 min – 1 hour) locks the screen after no mouse/keyboard activity in any open tab of the app (activity is shared between tabs, so a forgotten background tab never locks the one you are using). The PIN is stored as a salted hash in the browser only — a convenience lock, not account security. |

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
| PUT | `/api/tasks/reorder` | `{ order: [ids] }` sets board order (active profile only) |
| GET/POST | `/api/tasks` | filters: `project_id`, `employee_id`, `status`, `priority`, `q`, `due_from`, `due_to`, `has_due=1` |
| GET/PUT/DELETE | `/api/tasks/:id` | detail includes ordered `attachments[]` and `outputs[]` |
| POST/PUT | `/api/tasks/:id/attachments` | multipart upload (`files`), or `{ order: [ids] }` to reorder |
| GET/PATCH/DELETE | `/api/attachments/:id` | serve file (`?download=1`), rename / `{ position }`, delete |
| POST/PUT | `/api/tasks/:id/outputs` | create `{ title, content }`, or `{ order: [ids] }` |
| PUT/DELETE | `/api/outputs/:id` | `{ title, content, position }` |
| GET/POST | `/api/notes` | `?module=` filter |
| PUT/DELETE | `/api/notes/:id` | |
| GET | `/api/search?q=` | projects, employees, tasks |
| GET | `/api/stats` | dashboard numbers |
| GET | `/api/health` | DB connectivity (public) |
| POST/PUT | `/api/requirements/:id/attachments` | multipart upload (`files`), or `{ order: [ids] }` |
| GET/PATCH/DELETE | `/api/attachments/:kind/:id` | `kind` = `task` or `requirement` (the old `/api/attachments/:id` still serves task files) |
| GET/DELETE | `/api/notifications` | list (`?unread=1`, `?limit=`) / clear read |
| GET | `/api/notifications/count` | unread count |
| PUT/DELETE | `/api/notifications/:id` | `{ read: true|false }` / delete |
| POST | `/api/notifications/read-all` | mark everything read |
| POST | `/api/auth/login` | `{ email, password, remember }` (public) |
| POST | `/api/auth/logout` | ends the session |
| GET | `/api/auth/me` | current user |
| PUT | `/api/auth/profile` | own name / avatar colour |
| PUT | `/api/auth/password` | `{ current_password, new_password }` |
| PUT | `/api/auth/workspace` | admin only: `{ user_id }` to work inside that user's workspace, `{ user_id: null }` to return |
| GET/POST | `/api/profiles` | your profiles with counts (`active_id` = current) / create |
| PUT/DELETE | `/api/profiles/:id` | rename, colour, description, `is_default` / delete with all its data |
| POST | `/api/profiles/:id/activate` | make it the active profile (cookie) |
| GET/POST | `/api/users` | admin only |
| GET/PUT/DELETE | `/api/users/:id` | admin only; PUT accepts an optional `password` to reset |

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

## Push notifications

Preferences → Notifications → **Push (this device)** subscribes the browser with Web Push
(VAPID). Every notification that lands in the bell is also pushed to opted-in devices, and
tapping it opens the linked page. On iPhone the app must be added to the Home Screen first.

Reminders for tasks due today, tomorrow or overdue are generated by `/api/cron/reminders`,
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

Two values in the server's `.env` are permanent: `DATA_KEY` decrypts stored Info
credentials and `SESSION_SECRET` signs sessions. Attachments live in `UPLOAD_DIR`
outside the checkout. Back up the database, the uploads and that env file together.

## Adding a module

Register it in `src/lib/modules.js` (label, route, icon, colour) — the sidebar, breadcrumbs, sticky-note scopes and the **New** menu pick it up automatically — then add its table to `db/schema.sql`, route handlers under `src/app/api/<module>/`, and list/detail views under `src/components/modules/`.

## Translations

UI strings are translated at render time with `const tr = useT()` (from `src/lib/i18n.js`) and English text as the key: `tr("New task")`, `tr("{n} rows", { n })`. Unknown keys fall back to English, so add the English string to the `zhCN` map in `src/lib/i18n.js` to translate it. The chosen language is stored in the `ap_locale` cookie (read by the root layout, so the server renders the right language) and switching reloads the page. Dates and relative times follow the language through `setDateLocale` in `src/lib/utils.js`.
