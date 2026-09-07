/** Server-safe constants (no React/icon imports). */
export const PROJECT_STATUS = {
  planning: { label: "Planning", tone: "sky" },
  active: { label: "Active", tone: "emerald" },
  on_hold: { label: "On hold", tone: "amber" },
  completed: { label: "Completed", tone: "indigo" },
  archived: { label: "Archived", tone: "slate" },
};

export const EMPLOYEE_STATUS = {
  active: { label: "Active", tone: "emerald" },
  on_leave: { label: "On leave", tone: "amber" },
  inactive: { label: "Inactive", tone: "slate" },
};

export const TASK_STATUS = {
  todo: { label: "To do", tone: "slate" },
  in_progress: { label: "In progress", tone: "sky" },
  review: { label: "In review", tone: "violet" },
  done: { label: "Done", tone: "emerald" },
};

export const TASK_PRIORITY = {
  low: { label: "Low", tone: "slate" },
  medium: { label: "Medium", tone: "sky" },
  high: { label: "High", tone: "amber" },
  urgent: { label: "Urgent", tone: "rose" },
};

export const REQ_TYPE = {
  functional: { label: "Functional", tone: "indigo" },
  non_functional: { label: "Non-functional", tone: "violet" },
  technical: { label: "Technical", tone: "sky" },
  business: { label: "Business", tone: "emerald" },
  constraint: { label: "Constraint", tone: "amber" },
};

/** MoSCoW prioritisation */
export const REQ_PRIORITY = {
  must: { label: "Must have", tone: "rose" },
  should: { label: "Should have", tone: "amber" },
  could: { label: "Could have", tone: "sky" },
  wont: { label: "Won't have", tone: "slate" },
};

export const REQ_STATUS = {
  draft: { label: "Draft", tone: "slate" },
  approved: { label: "Approved", tone: "sky" },
  in_progress: { label: "In progress", tone: "violet" },
  done: { label: "Done", tone: "emerald" },
  rejected: { label: "Rejected", tone: "rose" },
};

/** Notification categories (users can mute each) and the event types inside them. */
export const INFO_CATEGORY = {
  guideline: { label: "Guideline", tone: "sky" },
  credential: { label: "Credential", tone: "amber" },
  link: { label: "Link", tone: "indigo" },
  note: { label: "Note", tone: "emerald" },
  other: { label: "Other", tone: "slate" },
};

export const NOTIFICATION_CATEGORIES = {
  tasks: { label: "Tasks", description: "Created, assigned, moved, completed" },
  requirements: { label: "Requirements", description: "Created and status changes" },
  projects: { label: "Projects", description: "Created, status changes, team changes" },
  reminders: { label: "Reminders", description: "Tasks due today, tomorrow or overdue" },
  team: { label: "Accounts", description: "User accounts created, changed or removed (admins)" },
  security: { label: "Security", description: "New sign-ins to your account" },
};

export const NOTIFICATION_TYPES = {
  task_created: { category: "tasks", label: "Task created", tone: "sky" },
  task_assigned: { category: "tasks", label: "Task assigned", tone: "sky" },
  task_status: { category: "tasks", label: "Task status", tone: "violet" },
  task_done: { category: "tasks", label: "Task completed", tone: "emerald" },
  attachment_added: { category: "tasks", label: "Attachment added", tone: "slate" },
  requirement_created: { category: "requirements", label: "Requirement created", tone: "sky" },
  requirement_status: { category: "requirements", label: "Requirement status", tone: "violet" },
  requirement_done: { category: "requirements", label: "Requirement delivered", tone: "emerald" },
  project_created: { category: "projects", label: "Project created", tone: "sky" },
  project_status: { category: "projects", label: "Project status", tone: "violet" },
  project_completed: { category: "projects", label: "Project completed", tone: "emerald" },
  project_member: { category: "projects", label: "Team change", tone: "indigo" },
  task_due: { category: "reminders", label: "Due soon", tone: "amber" },
  task_overdue: { category: "reminders", label: "Overdue", tone: "rose" },
  user_created: { category: "team", label: "Account created", tone: "sky" },
  user_updated: { category: "team", label: "Account changed", tone: "violet" },
  user_deleted: { category: "team", label: "Account removed", tone: "rose" },
  security_login: { category: "security", label: "New sign-in", tone: "amber" },
};

export const USER_ROLES = {
  admin: { label: "Admin", tone: "violet", description: "Full access, including user management" },
  user: { label: "User", tone: "sky", description: "Works with projects, employees and tasks" },
};

export const USER_STATUS = {
  active: { label: "Active", tone: "emerald" },
  disabled: { label: "Disabled", tone: "slate" },
};

export const NOTE_COLORS = {
  yellow: { label: "Yellow", bg: "#fef3c7", ink: "#78350f", darkBg: "#4a3d12", darkInk: "#fde68a" },
  pink: { label: "Pink", bg: "#fce7f3", ink: "#831843", darkBg: "#4d1f3a", darkInk: "#fbcfe8" },
  blue: { label: "Blue", bg: "#dbeafe", ink: "#1e3a8a", darkBg: "#1d3260", darkInk: "#bfdbfe" },
  green: { label: "Green", bg: "#d1fae5", ink: "#064e3b", darkBg: "#123f33", darkInk: "#a7f3d0" },
  purple: { label: "Purple", bg: "#ede9fe", ink: "#4c1d95", darkBg: "#352761", darkInk: "#ddd6fe" },
  orange: { label: "Orange", bg: "#ffedd5", ink: "#7c2d12", darkBg: "#553017", darkInk: "#fed7aa" },
};

export const PALETTE = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f59e0b", "#84cc16",
  "#10b981", "#06b6d4", "#0ea5e9", "#3b82f6", "#a855f7", "#64748b",
];

export const DEPARTMENTS = ["Engineering", "Design", "Product", "Data", "Quality", "Operations", "Sales", "Marketing", "Finance", "People"];
export const MEMBER_ROLES = ["Lead", "PM", "Backend", "Frontend", "Mobile", "Design", "Data", "Infra", "QA", "Docs", "Sponsor", "Member"];
