"use client";
import { useState } from "react";
import { Layers, Users } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/table/DataTable";
import { StatusBadge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Controls";
import { ProjectChip, DueDateCell } from "./shared";
import { useFetch } from "@/lib/hooks";
import { useAuth } from "@/lib/auth-context";
import { useNav } from "@/lib/nav";
import { MODULE_MAP } from "@/lib/modules";
import { TASK_STATUS, TASK_PRIORITY } from "@/lib/constants";
import { useT } from "@/lib/i18n";

/** Tasks assigned to me in every profile I can open. Opening one from another profile switches to it first. */
export default function MyTasks() {
  const tr = useT();
  const router = useNav();
  const { user, switchProfile } = useAuth();
  const [all, setAll] = useState(false);
  const { data, loading, error } = useFetch(`/api/tasks/mine${all ? "" : "?open=1"}`);
  const mod = MODULE_MAP.mytasks;
  const open = (r) => (r.profile_id === user?.profile_id ? router.push(`/tasks/${r.id}`) : switchProfile(r.profile_id, `/tasks/${r.id}`));

  const columns = [
    { key: "title", label: tr("Task"), hideable: false, sortValue: (r) => r.title, render: (r) => <span className="font-medium">{r.title}</span> },
    {
      key: "profile_name", label: tr("Profile"), sortValue: (r) => r.profile_name,
      render: (r) => (
        <span className="my-task-profile inline-flex items-center gap-1.5 text-xs">
          <span className="grid h-5 w-5 place-items-center rounded text-white" style={{ background: r.profile_color }}>{r.access === "owner" ? <Layers size={11} /> : <Users size={11} />}</span>
          <span className="min-w-0"><span className="block truncate font-medium">{r.profile_name}</span>{r.access !== "owner" ? <span className="block truncate text-[11px] text-fg-muted">{r.profile_owner_name}</span> : null}</span>
        </span>
      ),
    },
    { key: "project_name", label: tr("Project"), sortValue: (r) => r.project_name ?? "", render: (r) => (r.project_id ? <ProjectChip id={r.project_id} name={r.project_name} code={r.project_code} color={r.project_color} link={false} /> : <span className="text-fg-faint">—</span>) },
    { key: "status", label: tr("Status"), sortValue: (r) => Object.keys(TASK_STATUS).indexOf(r.status), render: (r) => <StatusBadge map={TASK_STATUS} value={r.status} /> },
    { key: "priority", label: tr("Priority"), sortValue: (r) => Object.keys(TASK_PRIORITY).indexOf(r.priority), render: (r) => <StatusBadge map={TASK_PRIORITY} value={r.priority} /> },
    { key: "due_date", label: tr("Due"), sortValue: (r) => r.due_date ?? "9999", render: (r) => <DueDateCell date={r.due_date} status={r.status} /> },
  ];

  return (
    <>
      <PageHeader title={tr("My tasks")} description={tr(mod.description)} icon={mod.icon} color={mod.color} crumbs={[]} />
      <DataTable
        id="my-tasks"
        workspace={false}
        columns={columns}
        rows={data ?? []}
        loading={loading}
        error={error}
        onRowClick={open}
        searchPlaceholder={tr("Search my tasks…")}
        toolbar={<Toggle checked={all} onChange={setAll} label={tr("Show finished")} size="sm" />}
        emptyTitle={tr("Nothing is assigned to you")}
        emptyDescription={tr("Tasks appear here when they are assigned to an employee record linked to your account. Open Employees, edit your own record and pick yourself under Portal account.")}
      />
    </>
  );
}
