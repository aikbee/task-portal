"use client";
import { CheckSquare, UserPlus, ArrowRightLeft, CircleCheckBig, Paperclip, ClipboardList, FolderKanban, Users, CalendarClock, AlertTriangle, ShieldCheck, ShieldAlert, LogIn, Bell } from "lucide-react";
import { NOTIFICATION_TYPES } from "./constants";

const ICONS = {
  task_created: CheckSquare,
  task_assigned: UserPlus,
  task_status: ArrowRightLeft,
  task_done: CircleCheckBig,
  attachment_added: Paperclip,
  requirement_created: ClipboardList,
  requirement_status: ArrowRightLeft,
  requirement_done: CircleCheckBig,
  project_created: FolderKanban,
  project_status: ArrowRightLeft,
  project_completed: CircleCheckBig,
  project_member: Users,
  task_due: CalendarClock,
  task_overdue: AlertTriangle,
  user_created: ShieldCheck,
  user_updated: ShieldCheck,
  user_deleted: ShieldAlert,
  security_login: LogIn,
};

const TONE_CLASS = {
  slate: "bg-slate-500/12 text-slate-500",
  sky: "bg-sky-500/12 text-sky-500",
  violet: "bg-violet-500/12 text-violet-500",
  emerald: "bg-emerald-500/12 text-emerald-500",
  amber: "bg-amber-500/14 text-amber-500",
  rose: "bg-rose-500/12 text-rose-500",
  indigo: "bg-indigo-500/12 text-indigo-500",
};

export function notificationMeta(type) {
  const meta = NOTIFICATION_TYPES[type] ?? { label: type, tone: "slate", category: "tasks" };
  return { ...meta, Icon: ICONS[type] ?? Bell, toneClass: TONE_CLASS[meta.tone] ?? TONE_CLASS.slate };
}
