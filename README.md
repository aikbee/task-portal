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

**Profiles.** Each user can have several profiles (Profiles page, or the switcher at the top of the sidebar); a profile is a separate set of projects, requirements, employees and tasks — switch any time, mark one as default, and delete a profile to remove everything inside it (the last one cannot be deleted). Project codes and employee emails are unique per profile. Notifications remember which profile a record belongs to and switch to it when opened.

**Every user has their own workspace.** Projects, employees and tasks carry an owner; each account only ever sees and edits its own records (project codes and employee emails are unique per owner, and deleting a user deletes their workspace). Admins can step into another user's workspace from the **Workspace** menu in the top bar (or the briefcase action in the Users list) — an amber banner shows whose data they are looking at, and everything they create there belongs to that user.

Default accounts created by `npm run db:setup`: `admin@example.com / admin123` (admin) and `user@example.com / user123` (user). Change them from **Profile & password** in the account menu. Sticky notes are private per user. Sign out from the account menu or from the lock screen (which also clears the PIN lock, since signing back in requires the password).

**Passkeys.** Any user can add passkeys (Touch ID, Face ID, Windows Hello, a phone, or a security key) from **Profile & password → Passkeys** and then use **Sign in with a passkey** on the login page, with or without typing the email first. Passkeys are WebAuthn credentials (`@simplewebauthn`); the server stores only the public key, a signature counter and a name, and the challenge for each ceremony travels in a short-lived signed cookie. The relying party is the hostname of `APP_URL` (override with `WEBAUTHN_RP_ID`); passkeys need HTTPS except on `localhost`. Removing a passkey or changing the password does not affect the other.

**Two-factor authentication.** Any user can turn on an authenticator app (Google Authenticator, Authy, 1Password…) from **Profile & password → Two-factor authentication**: scan the QR code (or type the key), confirm a code, and save the ten one-time recovery codes. Password sign-ins then ask for the current 6-digit code or a recovery code, with an optional **trust this browser for 30 days**; five wrong codes end the attempt. Codes are RFC 6238 TOTP (SHA-1, 30 s, ±1 step, replay-protected); the secret is stored encrypted with `DATA_KEY`, recovery codes as SHA-256 hashes, trusted browsers as hashed random tokens. Users can issue new recovery codes (password), forget trusted browsers, or turn it off (password + code). Passkey and Google sign-ins are their own strong factor and skip the code. An admin can **reset 2FA** for an account that lost both phone and codes (Users module); the account is notified.

**Security page.** Account menu → **Security & sessions** (`/security`) lists every active session with its browser, OS, device class, IP, sign-in time, last activity and expiry, marks the current one, and lets the user terminate any other session or sign out all others at once. Below it, the **login history** shows the last 100 successful sign-ins and failed attempts (wrong password, wrong two-factor code, rejected passkey, disabled account) with method, device and IP; events are kept for 180 days. Admins get a **Sign out everywhere** action per account in the Users module.

**Continue with Google.** When `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set (an OAuth 2.0 web client whose authorised redirect URI is `APP_URL/api/auth/google/callback`), the login page shows a Google button. It never creates accounts: the Google identity is matched to an existing user by its stored id, or the first time by the verified Google email, which links the two. Users can also connect or disconnect Google from **Profile & password → Google account**. Every sign-in method ends in the same server-side session and sends the "new sign-in" security notification, which names the method.

Environment: `SESSION_SECRET` signs session cookies (regenerate it to sign everyone out); `DATA_KEY` encrypts Info secrets (keep it stable — changing it makes stored secrets unreadable); `COOKIE_SECURE=1` when serving over HTTPS; `APP_URL` is the public URL used for passkeys and the Google redirect.

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
| **Backgrounds** (admin) | Controls which of the 32 animated background styles users may pick (eighteen are WebGL scenes rendered with three.js, loaded only when active) in Preferences, the default for new browsers, and an optional lock that forces the default on everyone. Live previews of every style. Stored instance-wide in `app_settings`. |
| **Draw Board** | Freehand boards built on Fabric.js: pen, eraser (drag over strokes to remove them), text, rectangles, ellipses and images — paste a screenshot with ⌘V, drop a file, or Insert image. Select to move, resize (corner handles) and rotate (top handle); bring forward / send backward, duplicate, undo/redo (50 steps), zoom. Export as PNG, JPEG, WebP or SVG at the board's native size. Each board has notes with `@` tags and can be linked to a project; boards are themselves taggable from outputs and notes. Drawings are saved as Fabric JSON (images referenced by their attachment URL) with a JPEG thumbnail for lists and reports. |
| **Info search** | `/info/search` (Search button on the Info page): every word must match somewhere; choose to search titles & summaries, content, notes and/or attachment names; filter by category, project, tag or pinned; results show highlighted snippets per matched field; recent searches are remembered and the query lives in the URL. |
| **Language** | English or 简体中文 — switch from the globe in the top bar, Preferences → Appearance, or the login page. The choice is saved in a cookie; dates follow the language. Server-generated texts (notifications, API errors) stay English. |
| **Board** | Kanban board of tasks grouped by status (or priority / assignee). Drag a card to another column to change that field, drag within a column to reorder, quick-add a task at the bottom of any column, click a card to open it and double-click to edit. Filters by text, project, assignee and priority; compact cards option. Reassigning a task — from the assignee selector on the task page or by dragging a card into another person's column on the board — asks for confirmation first, since it moves the work into someone else's workload (the workspace owner is notified when an admin does it on their behalf). |
| **Calendar** | Tasks by due date in month, week or agenda view; filters by project / assignee / status, hide done, project deadlines as flags. Click a day for its task list (quick status change, edit, new task on that day), double-click or use the + on a day to create a task, and **drag a task to another day to reschedule it**. |
| **Split view** | Show 2 or 3 pages side by side (top-bar split menu or Preferences → Layout). The left pane is the main app; each extra pane embeds any page (modules, pinned pages, or “same as main”) and navigates independently. Drag the dividers to resize; pane pages and sizes persist. Pane header buttons: back, reload, swap with main, open in main, close. |
| **Background** | Thirty-two animated styles (CSS scenes such as *Aurora*, *Mesh*, *Orbs*, *Stars*, *Rain*, *Snow* and WebGL scenes such as *Galaxy*, *Earth*, *Ocean*, *Balloons*, *Hearts*, *Jellyfish*, *Ghosts*, *Portal*, *Wisps*, *Ringed planet*, *Nebula*, *Solar system*, *Grassland* with wind-swayed grass and grazing cows) or none; subtle / normal / vivid intensity, shuffle, pausable. **Show background only** (`⌘⇧.`, the top-bar wallpaper button, account menu, Preferences → Background, or the lock screen) fades every layer away so just the background plays; the first click or key press animates everything back. |
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
| PUT/POST/DELETE | `/api/auth/avatar` | `{ avatar: "preset:<key>" \| "initials" }` / multipart `file` photo / back to the default badge |
| GET | `/api/avatars/user/:id` · `/api/avatars/group/:id` | an uploaded picture (group pictures for members only) |
| PUT | `/api/auth/password` | `{ current_password, new_password }` |
| PUT | `/api/auth/workspace` | admin only: `{ user_id }` to work inside that user's workspace, `{ user_id: null }` to return |
| GET/POST | `/api/profiles` | your profiles with counts (`active_id` = current) / create |
| PUT/DELETE | `/api/profiles/:id` | rename, colour, description, `is_default` / delete with all its data |
| POST | `/api/profiles/:id/activate` | make it the active profile (cookie) |
| GET/POST | `/api/users` | admin only |
| GET/PUT/DELETE | `/api/users/:id` | admin only; PUT accepts an optional `password` to reset |

## Chat

`/chat` is a text-and-photo chat between friends, one to one or in groups.

- **Friends by QR code.** Every account gets a friend code (`XXXX-XXXX-XXXX`, shown as a QR code on the Friends tab). Scanning it opens `/chat?add=CODE`, which previews the person and asks before sending the request; the code can also be typed in. Requests must be accepted before either side can message; you can cancel, decline, unfriend or block, and regenerate your code so old QR codes stop working.
- **Messages.** Text (up to 4000 characters), Enter to send, Shift+Enter for a new line, day separators, "Seen" read receipts and unread counts. The sidebar badge counts unread messages plus requests waiting for you.
- **Voice and video calls.** In a direct chat the phone and camera buttons in the header call the other person (one-to-one; groups are not supported yet). They see a ringing card with Accept / Decline while the chat page is open, plus a bell and push entry "X is calling you" in case it is not. Media goes browser to browser over WebRTC through public STUN servers; an administrator can add a TURN server on the Moderation page for networks where direct connections fail. The in-call panel (full screen on phones, a corner panel on desktop) shows the remote video or avatar, your own preview, a timer, mute, camera on/off and hang up. Every call leaves a line in the chat ("Video call · 3:12", "Missed voice call", "Declined"); a missed call counts as unread and raises a notification. The server only relays signals over the live stream and logs the call; no audio or video passes through it.
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
- **Presence.** A green dot marks people who have the app open (their live stream is connected); a chat header shows "Online" or "Last seen 5 minutes ago", and a group header counts who is online. Someone goes offline 30 seconds after their last tab closes.
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
| POST | `/api/chat/calls` | `{ conversation_id, kind: audio\|video }` rings the other person of a direct chat (201; 409 when either of you is already in a call) |
| GET | `/api/chat/calls/ice` | ICE servers for the browser: public STUN plus the admin's TURN server |
| GET | `/api/chat/calls/:id` | the call's state |
| POST | `/api/chat/calls/:id/accept` · `/decline` | the person being called picks up (active) or says no |
| POST | `/api/chat/calls/:id/end` | hang up; while ringing the caller giving up marks it missed; `{ reason: "failed" }` logs a call that could not connect |
| POST | `/api/chat/calls/:id/signal` | `{ signal: { type: offer\|answer\|candidate, … } }` relayed to the other participant over the live stream (`call` events: `ring`, `accepted`, `signal`, `ended`) |
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

Two values in the server's `.env` are permanent: `DATA_KEY` decrypts stored Info
credentials and `SESSION_SECRET` signs sessions. Attachments live in `UPLOAD_DIR`
outside the checkout. Back up the database, the uploads and that env file together.

## Adding a module

Register it in `src/lib/modules.js` (label, route, icon, colour) — the sidebar, breadcrumbs, sticky-note scopes and the **New** menu pick it up automatically — then add its table to `db/schema.sql`, route handlers under `src/app/api/<module>/`, and list/detail views under `src/components/modules/`.

## Translations

UI strings are translated at render time with `const tr = useT()` (from `src/lib/i18n.js`) and English text as the key: `tr("New task")`, `tr("{n} rows", { n })`. Unknown keys fall back to English, so add the English string to the `zhCN` map in `src/lib/i18n.js` to translate it. The chosen language is stored in the `ap_locale` cookie (read by the root layout, so the server renders the right language) and switching reloads the page. Dates and relative times follow the language through `setDateLocale` in `src/lib/utils.js`.
