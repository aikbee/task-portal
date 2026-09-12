import { LayoutDashboard, FolderKanban, ClipboardList, Users, CheckSquare, ShieldCheck, Bell, Layers, CalendarDays, SquareKanban, BookOpen, Brush, Palette } from "lucide-react";

/**
 * Module registry. The sidebar, breadcrumbs, sticky notes and "New" menu are
 * all driven from this list so adding a module is a one-line change here.
 */
export const MODULES = [
  {
    key: "dashboard",
    label: "Dashboard",
    singular: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    color: "#6366f1",
    description: "Overview of projects, people and work in flight.",
  },
  {
    key: "projects",
    label: "Projects",
    singular: "Project",
    href: "/projects",
    api: "/api/projects",
    icon: FolderKanban,
    color: "#8b5cf6",
    description: "Projects group employees and tasks together.",
    creatable: true,
  },
  {
    key: "requirements",
    label: "Requirements",
    singular: "Requirement",
    href: "/requirements",
    api: "/api/requirements",
    icon: ClipboardList,
    color: "#ec4899",
    description: "What each project must deliver, prioritised and tracked.",
    creatable: true,
  },
  {
    key: "employees",
    label: "Employees",
    singular: "Employee",
    href: "/employees",
    api: "/api/employees",
    icon: Users,
    color: "#06b6d4",
    description: "People who belong to projects and own tasks.",
    creatable: true,
  },
  {
    key: "tasks",
    label: "Tasks",
    singular: "Task",
    href: "/tasks",
    api: "/api/tasks",
    icon: CheckSquare,
    color: "#10b981",
    description: "Units of work with attachments and long-form outputs.",
    creatable: true,
  },
  {
    key: "info",
    label: "Info",
    singular: "Info item",
    href: "/info",
    api: "/api/info",
    icon: BookOpen,
    color: "#14b8a6",
    description: "Guidelines, credentials, links and reference notes — each with its own notes and attachments.",
    creatable: true,
  },
  {
    key: "drawboards",
    label: "Draw Board",
    singular: "Board",
    href: "/drawboards",
    api: "/api/drawboards",
    icon: Brush,
    color: "#f97316",
    description: "Sketch ideas, paste screenshots, move, resize and rotate them, tag related records and export as an image.",
    creatable: true,
  },
  {
    key: "board",
    label: "Board",
    singular: "Board",
    href: "/board",
    icon: SquareKanban,
    color: "#a855f7",
    description: "Kanban board — drag tasks between columns to change status, priority or assignee.",
  },
  {
    key: "calendar",
    label: "Calendar",
    singular: "Calendar",
    href: "/calendar",
    icon: CalendarDays,
    color: "#0ea5e9",
    description: "Tasks by due date — month, week and agenda views. Drag a task to reschedule it.",
  },
  {
    key: "profiles",
    label: "Profiles",
    singular: "Profile",
    href: "/profiles",
    api: "/api/profiles",
    icon: Layers,
    color: "#8b5cf6",
    description: "Separate sets of projects, requirements, employees and tasks. Switch any time.",
    creatable: true,
  },
  {
    key: "notifications",
    label: "Notifications",
    singular: "Notification",
    href: "/notifications",
    api: "/api/notifications",
    icon: Bell,
    color: "#f59e0b",
    description: "What changed in your workspace, reminders and security alerts.",
  },
  {
    key: "backgrounds",
    label: "Backgrounds",
    singular: "Background",
    href: "/backgrounds",
    icon: Palette,
    color: "#ec4899",
    description: "Choose which background styles users can pick, set the default, or lock one for everyone.",
    adminOnly: true,
  },
  {
    key: "users",
    label: "Users",
    singular: "User",
    href: "/users",
    api: "/api/users",
    icon: ShieldCheck,
    color: "#f59e0b",
    description: "Login accounts and roles (admin / user).",
    creatable: true,
    adminOnly: true,
  },
];

/** Modules visible to a given role. */
export const modulesForRole = (role) => MODULES.filter((m) => !m.adminOnly || role === "admin");

export const MODULE_MAP = Object.fromEntries(MODULES.map((m) => [m.key, m]));

export function moduleFromPath(pathname = "/") {
  const seg = pathname.split("/").filter(Boolean)[0];
  return MODULE_MAP[seg] ?? MODULE_MAP.dashboard;
}

export * from "./constants";
