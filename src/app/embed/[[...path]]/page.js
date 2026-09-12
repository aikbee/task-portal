import { Suspense } from "react";
import Link from "next/link";
import DashboardView from "@/components/modules/DashboardView";
import ProjectsList from "@/components/modules/ProjectsList";
import ProjectDetail from "@/components/modules/ProjectDetail";
import EmployeesList from "@/components/modules/EmployeesList";
import EmployeeDetail from "@/components/modules/EmployeeDetail";
import TasksList from "@/components/modules/TasksList";
import TaskDetail from "@/components/modules/TaskDetail";
import UsersList from "@/components/modules/UsersList";
import RequirementsList from "@/components/modules/RequirementsList";
import RequirementDetail from "@/components/modules/RequirementDetail";
import NotificationsList from "@/components/modules/NotificationsList";
import ProfilesList from "@/components/modules/ProfilesList";
import CalendarView from "@/components/modules/CalendarView";
import BoardView from "@/components/modules/BoardView";
import InfoList from "@/components/modules/InfoList";
import InfoDetail from "@/components/modules/InfoDetail";
import InfoSearch from "@/components/modules/InfoSearch";
import DrawBoardsList from "@/components/modules/DrawBoardsList";
import DrawBoardDetail from "@/components/modules/DrawBoardDetail";

/**
 * Mirrors the app's routes under /embed/* so a pane can show any page
 * without the surrounding chrome. /embed → dashboard, /embed/tasks/8 → task 8…
 */
function pick(segments) {
  const [mod, id, ...rest] = segments;
  if (rest.length) return null;
  if (mod === "info" && id === "search") return <InfoSearch />;
  const num = id != null ? Number(id) : null;
  if (id != null && !Number.isInteger(num)) return null;
  switch (mod) {
    case undefined:
    case "dashboard":
      return id == null ? <DashboardView /> : null;
    case "projects":
      return id == null ? <ProjectsList /> : <ProjectDetail id={num} />;
    case "employees":
      return id == null ? <EmployeesList /> : <EmployeeDetail id={num} />;
    case "tasks":
      return id == null ? <TasksList /> : <TaskDetail id={num} />;
    case "requirements":
      return id == null ? <RequirementsList /> : <RequirementDetail id={num} />;
    case "info":
      return id == null ? <InfoList /> : <InfoDetail id={num} />;
    case "board":
      return id == null ? <BoardView /> : null;
    case "drawboards":
      return id == null ? <DrawBoardsList /> : <DrawBoardDetail id={num} />;
    case "calendar":
      return id == null ? <CalendarView /> : null;
    case "profiles":
      return id == null ? <ProfilesList /> : null;
    case "notifications":
      return id == null ? <NotificationsList /> : null;
    case "users":
      return id == null ? <UsersList /> : null;
    default:
      return null;
  }
}

export default async function Page({ params }) {
  const { path = [] } = await params;
  const view = pick(path);
  if (!view) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm font-medium">This page cannot be shown in a pane.</p>
        <Link href="/embed" className="mt-3 inline-block text-xs text-accent hover:underline">Go to dashboard</Link>
      </div>
    );
  }
  return <Suspense fallback={null}>{view}</Suspense>;
}
