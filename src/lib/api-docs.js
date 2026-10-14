import { API_SCOPES } from "./api-scopes.js";

/**
 * The stable API (/api/v1) described once: the /developers page renders it and /api/v1/openapi.json is built from
 * it, so the two never disagree. Plain module.
 */
export const API_BASE = "/api/v1";
export const STATUSES = ["todo", "in_progress", "review", "done"];
export const PRIORITIES = ["low", "medium", "high", "urgent"];
export const WEBHOOK_EVENT_DOCS = {
  "task.created": "A task was created.",
  "task.updated": "A task changed (data.changed lists the fields).",
  "task.status_changed": "A task moved to another status (data.from, data.to).",
  "task.assigned": "People were put on or taken off a task (data.added, data.removed).",
  "task.completed": "A task was marked done.",
  "task.deleted": "A task went to the recycle bin.",
  "task.comment": "Somebody commented on a task.",
  "project.created": "A project was created.", "project.updated": "A project changed.", "project.deleted": "A project was deleted.",
  "requirement.created": "A requirement was created.", "requirement.updated": "A requirement changed.", "requirement.deleted": "A requirement was deleted.",
};

const T = { s: "string", i: "integer", n: "number", b: "boolean", a: "array", o: "object" };
const field = (name, type, description, extra = {}) => ({ name, type, description, ...extra });

/** Fields of a task you can send (create and update). */
export const TASK_INPUT = [
  field("title", T.s, "What has to be done. Required to create; up to 200 characters.", { required: true, example: "Call back Acme about the renewal" }),
  field("description", T.s, "Details, in Markdown.", { example: "They asked for a quote for 25 more seats." }),
  field("status", T.s, "One of todo, in_progress, review, done. New tasks start at todo.", { enum: STATUSES }),
  field("priority", T.s, "One of low, medium, high, urgent. Default medium.", { enum: PRIORITIES }),
  field("project", T.s, "The project, by its code (\"CS\") or id. null takes it out of its project.", { example: "CS" }),
  field("assignees", T.a, "Everybody on the task, by email or employee id, the lead first. Replaces the list; [] unassigns everybody.", { items: T.s, example: ["hannah@example.com"] }),
  field("add_assignees", T.a, "Update only: people to add, by email or employee id.", { items: T.s }),
  field("remove_assignees", T.a, "Update only: people to take off, by email or employee id.", { items: T.s }),
  field("start_date", T.s, "YYYY-MM-DD.", { format: "date" }),
  field("due_date", T.s, "YYYY-MM-DD. Not before start_date.", { format: "date", example: "2026-10-20" }),
  field("estimate_hours", T.n, "0 to 9999.", { example: 4 }),
  field("tags", T.a, "Words, as a list or comma separated.", { items: T.s, example: ["support"] }),
  field("external_id", T.s, "Your own id for this task, up to 120 characters, unique in the workspace: find the task again with ?external_id=.", { example: "CRM-1042" }),
];

const TASK_EXAMPLE = {
  id: 1287, title: "Call back Acme about the renewal", description: "They asked for a quote for 25 more seats.", status: "in_progress", priority: "high",
  project: { id: 3, name: "Customer Success", code: "CS" },
  assignees: [{ id: 41, name: "Hannah Weiss", email: "hannah@example.com", lead: true }],
  start_date: null, due_date: "2026-10-20", estimate_hours: 4, tags: ["support"], external_id: "CRM-1042",
  checklist: { done: 1, total: 3 }, comment_count: 2, file_count: 1, minutes_logged: 90, blocked: false,
  url: "https://task.system-portal.com/tasks/1287", created_at: "2026-10-14T03:12:09.000Z", updated_at: "2026-10-14T05:40:51.000Z",
};

/** The endpoints, grouped as the docs show them. Paths are relative to API_BASE. */
export const ENDPOINTS = [
  {
    group: "Tasks",
    items: [
      {
        id: "list-tasks", method: "GET", path: "/tasks", scope: "tasks:read", summary: "List tasks", exampleQuery: "status=todo,in_progress&assignee=hannah@example.com&limit=50",
        description: "The tasks of the token's workspace, newest change first. With updated_since the oldest change comes first, so a sync can walk forward page by page.",
        query: [
          field("status", T.s, "One or more statuses, comma separated: todo,in_progress"),
          field("priority", T.s, "One or more priorities, comma separated."),
          field("project", T.s, "Project code or id."),
          field("assignee", T.s, "Email or employee id of somebody on the task."),
          field("tag", T.s, "One tag."),
          field("q", T.s, "Words in the title or description."),
          field("external_id", T.s, "Your own id, as you set it."),
          field("updated_since", T.s, "ISO 8601 date and time: only tasks changed since then (oldest first).", { format: "date-time" }),
          field("due_from", T.s, "Due on or after this date (YYYY-MM-DD).", { format: "date" }),
          field("due_to", T.s, "Due on or before this date (YYYY-MM-DD).", { format: "date" }),
          field("order", T.s, "updated_desc (default) or updated_asc.", { enum: ["updated_desc", "updated_asc"] }),
          field("limit", T.i, "1 to 200, default 50."),
          field("cursor", T.s, "next_cursor of the previous page."),
        ],
        response: { schema: "TaskPage", example: { data: [TASK_EXAMPLE], next_cursor: "eyJ1IjoiMjAyNi0xMC0xNFQwNTo0MDo1MS4wMDBaIiwiaSI6MTI4N30" } },
      },
      {
        id: "create-task", method: "POST", path: "/tasks", scope: "tasks:write", summary: "Create a task", idempotent: true,
        description: "Assign people by email (the employee's email, or the email of the account linked to them) or by employee id. Everybody assigned is told, as when a person assigns them in the app.",
        body: { schema: "TaskInput", fields: TASK_INPUT.filter((f) => !["add_assignees", "remove_assignees"].includes(f.name)), example: { title: "Call back Acme about the renewal", priority: "high", project: "CS", assignees: ["hannah@example.com"], due_date: "2026-10-20", external_id: "CRM-1042" } },
        response: { status: 201, schema: "Task", example: { data: TASK_EXAMPLE } },
      },
      { id: "get-task", method: "GET", path: "/tasks/{id}", scope: "tasks:read", summary: "Get a task", response: { schema: "Task", example: { data: TASK_EXAMPLE } } },
      {
        id: "update-task", method: "PATCH", path: "/tasks/{id}", scope: "tasks:write", summary: "Update or assign a task",
        description: "Send only what changes. assignees replaces the list; add_assignees and remove_assignees change it. Completing a repeating task creates its next one, as in the app.",
        body: { schema: "TaskPatch", fields: TASK_INPUT.map((f) => ({ ...f, required: false })), example: { status: "review", add_assignees: ["liam@example.com"] } },
        response: { schema: "Task", example: { data: { ...TASK_EXAMPLE, status: "review" } } },
      },
      { id: "delete-task", method: "DELETE", path: "/tasks/{id}", scope: "tasks:delete", summary: "Delete a task", description: "The task goes to the workspace's recycle bin, with everything on it; it can be restored in the app for 30 days.", response: { schema: "Deleted", example: { data: { id: 1287, deleted: true, trash_id: 512 } } } },
      { id: "get-status", method: "GET", path: "/tasks/{id}/status", scope: "tasks:read", summary: "Check a task's status", description: "Just the status: cheap to poll. Webhooks (task.status_changed) save the polling.", response: { schema: "Status", example: { data: { id: 1287, status: "done", label: "Done", done: true, updated_at: "2026-10-14T06:02:11.000Z" } } } },
      { id: "set-status", method: "PUT", path: "/tasks/{id}/status", scope: "tasks:write", summary: "Change a task's status", body: { schema: "StatusInput", fields: [field("status", T.s, "todo, in_progress, review or done.", { required: true, enum: STATUSES })], example: { status: "done" } }, response: { schema: "Status", example: { data: { id: 1287, status: "done", label: "Done", done: true, updated_at: "2026-10-14T06:02:11.000Z" } } } },
    ],
  },
  {
    group: "Comments",
    items: [
      { id: "list-comments", method: "GET", path: "/tasks/{id}/comments", scope: "tasks:read", summary: "List comments", description: "Oldest first. via names the API token a comment came through.", response: { schema: "CommentList", example: { data: [{ id: 77, body: "Quote sent, waiting for their answer.", author: "Sam Taylor", via: "Acme CRM", created_at: "2026-10-14T06:00:00.000Z", edited_at: null }] } } },
      { id: "add-comment", method: "POST", path: "/tasks/{id}/comments", scope: "comments:write", summary: "Add a comment", idempotent: true, description: "Markdown, up to 5000 characters. The people on the task and earlier commenters are told.", body: { schema: "CommentInput", fields: [field("body", T.s, "The comment.", { required: true })], example: { body: "Quote sent, waiting for their answer." } }, response: { status: 201, schema: "Comment", example: { data: { id: 77, body: "Quote sent, waiting for their answer.", author: "Sam Taylor", via: "Acme CRM", created_at: "2026-10-14T06:00:00.000Z", edited_at: null } } } },
    ],
  },
  {
    group: "Time",
    items: [
      { id: "list-time", method: "GET", path: "/tasks/{id}/time", scope: "tasks:read", summary: "List time entries", response: { schema: "TimeList", example: { data: { entries: [{ id: 301, minutes: 90, spent_on: "2026-10-14", note: "Prepared the quote", person: "Sam Taylor", running: false, started_at: null }], total_minutes: 90 } } } },
      { id: "log-time", method: "POST", path: "/tasks/{id}/time", scope: "time:write", summary: "Log time", idempotent: true, description: "Logged as the token's owner.", body: { schema: "TimeInput", fields: [field("minutes", T.i, "1 to 1440. Or send duration instead."), field("duration", T.s, "Written like a person would: \"1h 30m\", \"45m\", \"1.5\" (hours)."), field("spent_on", T.s, "YYYY-MM-DD, default today (UTC).", { format: "date" }), field("note", T.s, "What was done, up to 255 characters.")], example: { duration: "1h 30m", spent_on: "2026-10-14", note: "Prepared the quote" } }, response: { status: 201, schema: "TimeLogged", example: { data: { entry: { id: 301, minutes: 90, spent_on: "2026-10-14", note: "Prepared the quote", person: "Sam Taylor", running: false, started_at: null }, total_minutes: 90 } } } },
    ],
  },
  {
    group: "Files",
    items: [
      { id: "list-files", method: "GET", path: "/tasks/{id}/files", scope: "tasks:read", summary: "List files", response: { schema: "FileList", example: { data: [{ id: 58, name: "quote.pdf", size: 48213, type: "application/pdf", created_at: "2026-10-14T06:05:00.000Z", download_url: "https://task.system-portal.com/api/v1/tasks/1287/files/58" }] } } },
      { id: "upload-files", method: "POST", path: "/tasks/{id}/files", scope: "files:write", summary: "Upload files", idempotent: true, description: "multipart/form-data with one or more parts named files, up to 50 MB each. Answers every file of the task.", multipart: true, response: { status: 201, schema: "FileList", example: { data: [{ id: 58, name: "quote.pdf", size: 48213, type: "application/pdf", created_at: "2026-10-14T06:05:00.000Z", download_url: "https://task.system-portal.com/api/v1/tasks/1287/files/58" }] } } },
      { id: "download-file", method: "GET", path: "/tasks/{id}/files/{fileId}", scope: "tasks:read", summary: "Download a file", description: "Answers the file itself.", binary: true },
      { id: "delete-file", method: "DELETE", path: "/tasks/{id}/files/{fileId}", scope: "files:write", summary: "Remove a file", description: "The file goes to the recycle bin. Answers the files that are left.", response: { schema: "FileList", example: { data: [] } } },
    ],
  },
  {
    group: "Lookups",
    items: [
      { id: "list-projects", method: "GET", path: "/projects", scope: "projects:read", summary: "List projects", response: { schema: "ProjectList", example: { data: [{ id: 3, name: "Customer Success", code: "CS", status: "active", color: "#06b6d4" }] } } },
      { id: "list-people", method: "GET", path: "/people", scope: "people:read", summary: "List people", description: "The employees of the workspace: who tasks can be assigned to.", response: { schema: "PersonList", example: { data: [{ id: 41, name: "Hannah Weiss", email: "hannah@example.com", job_title: "Data Engineer", department: "Data", status: "active", has_account: true }] } } },
      { id: "me", method: "GET", path: "/me", scope: null, summary: "Who am I", description: "The token's owner, its workspace, its permissions and limits. Any token may call it.", response: { schema: "Me", example: { data: { user: { id: 2, name: "Sam Taylor", email: "sam@example.com" }, workspace: { id: 2, name: "Support", access: "owner" }, token: { name: "Acme CRM", scope: "write", scopes: ["tasks:read", "tasks:write"], ip_allow: null, rate_limit: { per_minute: 60, per_day: 5000 } } } } } },
    ],
  },
];

/* ---------- OpenAPI 3.0 ---------- */

const schemaOfField = (f) => {
  const s = { type: f.type === T.a ? "array" : f.type, description: f.description };
  if (f.type === T.a) s.items = { type: f.items ?? "string" };
  if (f.enum) s.enum = f.enum;
  if (f.format) s.format = f.format;
  if (f.example !== undefined) s.example = f.example;
  return s;
};
const objectOf = (fields) => {
  const required = fields.filter((f) => f.required).map((f) => f.name);
  return { type: "object", properties: Object.fromEntries(fields.map((f) => [f.name, schemaOfField(f)])), ...(required.length ? { required } : {}) };
};
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const listOf = (name) => ({ type: "object", properties: { data: { type: "array", items: ref(name) } } });
const one = (name) => ({ type: "object", properties: { data: ref(name) } });

const SCHEMAS = {
  Task: {
    type: "object",
    properties: {
      id: { type: "integer" }, title: { type: "string" }, description: { type: "string" }, status: { type: "string", enum: STATUSES }, priority: { type: "string", enum: PRIORITIES },
      project: { type: "object", nullable: true, properties: { id: { type: "integer" }, name: { type: "string" }, code: { type: "string" } } },
      assignees: { type: "array", items: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" }, email: { type: "string", nullable: true }, lead: { type: "boolean" } } } },
      start_date: { type: "string", format: "date", nullable: true }, due_date: { type: "string", format: "date", nullable: true }, estimate_hours: { type: "number", nullable: true },
      tags: { type: "array", items: { type: "string" } }, external_id: { type: "string", nullable: true },
      checklist: { type: "object", properties: { done: { type: "integer" }, total: { type: "integer" } } }, comment_count: { type: "integer" }, file_count: { type: "integer" }, minutes_logged: { type: "integer" }, blocked: { type: "boolean" },
      url: { type: "string" }, created_at: { type: "string", format: "date-time" }, updated_at: { type: "string", format: "date-time" },
    },
    example: TASK_EXAMPLE,
  },
  TaskInput: objectOf(TASK_INPUT.filter((f) => !["add_assignees", "remove_assignees"].includes(f.name))),
  TaskPatch: objectOf(TASK_INPUT.map((f) => ({ ...f, required: false }))),
  TaskPage: { type: "object", properties: { data: { type: "array", items: ref("Task") }, next_cursor: { type: "string", nullable: true } } },
  Status: { type: "object", properties: { id: { type: "integer" }, status: { type: "string", enum: STATUSES }, label: { type: "string" }, done: { type: "boolean" }, updated_at: { type: "string", format: "date-time" } } },
  StatusInput: objectOf([field("status", T.s, "The new status.", { required: true, enum: STATUSES })]),
  Deleted: { type: "object", properties: { id: { type: "integer" }, deleted: { type: "boolean" }, trash_id: { type: "integer" } } },
  Comment: { type: "object", properties: { id: { type: "integer" }, body: { type: "string" }, author: { type: "string" }, via: { type: "string", nullable: true }, created_at: { type: "string", format: "date-time" }, edited_at: { type: "string", format: "date-time", nullable: true } } },
  CommentInput: objectOf([field("body", T.s, "The comment, Markdown.", { required: true })]),
  TimeEntry: { type: "object", properties: { id: { type: "integer" }, minutes: { type: "integer" }, spent_on: { type: "string", format: "date" }, note: { type: "string", nullable: true }, person: { type: "string" }, running: { type: "boolean" }, started_at: { type: "string", format: "date-time", nullable: true } } },
  TimeInput: objectOf([field("minutes", T.i, "1 to 1440."), field("duration", T.s, "\"1h 30m\", \"45m\" or \"1.5\" (hours)."), field("spent_on", T.s, "YYYY-MM-DD.", { format: "date" }), field("note", T.s, "Up to 255 characters.")]),
  File: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" }, size: { type: "integer" }, type: { type: "string", nullable: true }, created_at: { type: "string", format: "date-time" }, download_url: { type: "string" } } },
  Project: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" }, code: { type: "string" }, status: { type: "string" }, color: { type: "string" } } },
  Person: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" }, email: { type: "string", nullable: true }, job_title: { type: "string", nullable: true }, department: { type: "string", nullable: true }, status: { type: "string" }, has_account: { type: "boolean" } } },
  Error: { type: "object", properties: { error: { type: "string" }, details: { type: "object" } } },
};
const RESPONSE_SCHEMA = {
  TaskPage: ref("TaskPage"), Task: one("Task"), Status: one("Status"), Deleted: one("Deleted"), CommentList: listOf("Comment"), Comment: one("Comment"),
  TimeList: { type: "object", properties: { data: { type: "object", properties: { entries: { type: "array", items: ref("TimeEntry") }, total_minutes: { type: "integer" } } } } },
  TimeLogged: { type: "object", properties: { data: { type: "object", properties: { entry: ref("TimeEntry"), total_minutes: { type: "integer" } } } } },
  FileList: listOf("File"), ProjectList: listOf("Project"), PersonList: listOf("Person"),
  Me: { type: "object", properties: { data: { type: "object" } } },
};

/** The OpenAPI 3.0 document of /api/v1. */
export function openApi(origin = "") {
  const paths = {};
  for (const g of ENDPOINTS) {
    for (const e of g.items) {
      const op = {
        operationId: e.id.replace(/-(\w)/g, (_, c) => c.toUpperCase()),
        tags: [g.group],
        summary: e.summary,
        description: [e.description, e.scope ? `Needs the ${e.scope} permission.` : null, e.idempotent ? "Send an Idempotency-Key header to make retries safe." : null].filter(Boolean).join(" "),
        parameters: [
          ...[...e.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "integer" } })),
          ...(e.query ?? []).map((q) => ({ name: q.name, in: "query", required: false, description: q.description, schema: schemaOfField(q) })),
          ...(e.idempotent ? [{ name: "Idempotency-Key", in: "header", required: false, description: "Any string up to 100 characters; a retry with the same key gets the first answer back.", schema: { type: "string" } }] : []),
        ],
        responses: {
          [String(e.response?.status ?? 200)]: e.binary
            ? { description: "The file.", content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } }
            : { description: "OK", content: { "application/json": { schema: RESPONSE_SCHEMA[e.response.schema] ?? one(e.response.schema), example: e.response.example } } },
          400: { description: "The request is not valid; error says why.", content: { "application/json": { schema: ref("Error") } } },
          401: { description: "No token, or a wrong or expired one." },
          403: { description: "The token may not do this (permissions, address, or a shared workspace's role)." },
          404: { description: "Not found in the token's workspace." },
          429: { description: "Too many requests: wait Retry-After seconds." },
        },
      };
      if (e.body) op.requestBody = { required: true, content: { "application/json": { schema: ref(e.body.schema), example: e.body.example } } };
      if (e.multipart) op.requestBody = { required: true, content: { "multipart/form-data": { schema: { type: "object", properties: { files: { type: "array", items: { type: "string", format: "binary" } } } } } } };
      paths[e.path] ??= {};
      paths[e.path][e.method.toLowerCase()] = op;
    }
  }
  return {
    openapi: "3.0.3",
    info: { title: "Task Portal API", version: "1.0", description: `Create, assign, update and follow tasks in a Task Portal workspace. Guide: ${origin}/developers` },
    servers: [{ url: `${origin}${API_BASE}` }],
    security: [{ bearer: [] }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "A tp_… API token made in Task Portal (Integrations → Task Portal API)." } },
      schemas: SCHEMAS,
    },
    tags: ENDPOINTS.map((g) => ({ name: g.group })),
    paths,
  };
}

export { API_SCOPES };
