"use client";
import { useCallback, useMemo, useState } from "react";
import { useNav } from "@/lib/nav";
import { Plus, Mail, Phone } from "lucide-react";
import DataTable from "@/components/table/DataTable";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Select } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import EmployeeForm from "./EmployeeForm";
import { useCrudList, useNewParam, useNewShortcut, RowActions, useDeleteFlow, PersonCell, ProjectChip } from "./shared";
import { EMPLOYEE_STATUS, MODULE_MAP } from "@/lib/modules";
import { fullName, formatDate } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export default function EmployeesList() {
  const tr = useT();
  const router = useNav();
  const toast = useToast();
  const [status, setStatus] = useState("");
  const [department, setDepartment] = useState("");
  const qs = new URLSearchParams();
  if (status) qs.set("status", status);
  if (department) qs.set("department", department);
  const url = `/api/employees${qs.toString() ? `?${qs}` : ""}`;
  const { rows, loading, error, refetch, removeLocal } = useCrudList(url);
  const { rows: allRows } = useCrudList("/api/employees");
  const departments = useMemo(() => [...new Set(allRows.map((r) => r.department).filter(Boolean))].sort(), [allRows]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const openNew = useCallback(() => { setEditing(null); setFormOpen(true); }, []);
  useNewParam("/employees", openNew);
  useNewShortcut(openNew);
  const del = useDeleteFlow("/api/employees", { toast, label: "employee", onDeleted: removeLocal });
  const mod = MODULE_MAP.employees;

  const columns = [
    { key: "name", label: tr("Employee"), hideable: false, sortValue: (r) => fullName(r), render: (r) => <PersonCell id={r.id} name={fullName(r)} color={r.avatar_color} sub={r.email} link={false} size="md" /> },
    { key: "job_title", label: tr("Title") },
    { key: "department", label: tr("Department"), render: (r) => r.department || <span className="text-fg-faint">—</span> },
    { key: "status", label: tr("Status"), render: (r) => <StatusBadge map={EMPLOYEE_STATUS} value={r.status} /> },
    {
      key: "projects", label: tr("Projects"), sortValue: (r) => r.project_count,
      render: (r) => (
        <span className="flex max-w-xs flex-wrap gap-1">
          {r.projects.slice(0, 3).map((p) => <ProjectChip key={p.id} {...p} />)}
          {r.projects.length > 3 ? <span className="text-xs text-fg-muted">+{r.projects.length - 3}</span> : null}
          {!r.projects.length ? <span className="text-fg-faint">—</span> : null}
        </span>
      ),
    },
    {
      key: "tasks", label: tr("Tasks"), align: "center", sortValue: (r) => r.open_task_count,
      render: (r) => (
        <span className="inline-flex items-center gap-1 text-xs">
          <b className="text-fg">{r.open_task_count}</b><span className="text-fg-muted">{tr("open")}</span>
          <span className="text-fg-faint">/</span><span className="text-fg-muted">{r.task_count}</span>
        </span>
      ),
    },
    { key: "phone", label: tr("Phone"), defaultHidden: true, render: (r) => r.phone ? <a href={`tel:${r.phone}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 hover:text-accent"><Phone size={12} />{r.phone}</a> : <span className="text-fg-faint">—</span> },
    { key: "email", label: tr("Email"), defaultHidden: true, render: (r) => <a href={`mailto:${r.email}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 hover:text-accent"><Mail size={12} />{r.email}</a> },
    { key: "hired_at", label: tr("Hired"), render: (r) => formatDate(r.hired_at) || <span className="text-fg-faint">—</span> },
    { key: "created_at", label: tr("Created"), defaultHidden: true, render: (r) => formatDate(r.created_at) },
  ];

  return (
    <>
      <PageHeader title={tr("Employees")} description={tr(mod.description)} icon={mod.icon} color={mod.color} crumbs={[]} actions={<Button icon={Plus} onClick={openNew}>{tr("New employee")}</Button>} />
      <DataTable
        id="employees"
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        defaultSort={{ key: "name", dir: "asc" }}
        searchPlaceholder={tr("Search people…")}
        dateFields={[
          { key: "hired_at", label: tr("Hired") },
          { key: "created_at", label: tr("Created") },
        ]}
        onRowClick={(r) => router.push(`/employees/${r.id}`)}
        selectable
        onDeleteSelected={(ids) => del.setTarget({ ids })}
        rowActions={(r) => <RowActions href={`/employees/${r.id}`} onEdit={() => { setEditing(r); setFormOpen(true); }} onDelete={() => del.setTarget(r)} />}
        filters={
          <>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-36">
              <option value="">{tr("All statuses")}</option>
              {Object.entries(EMPLOYEE_STATUS).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
            </Select>
            <Select value={department} onChange={(e) => setDepartment(e.target.value)} className="h-9 w-40">
              <option value="">{tr("All departments")}</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </>
        }
        emptyTitle={tr("No employees yet")}
        emptyDescription={tr("Add people so they can be assigned to projects and tasks.")}
        emptyAction={<Button icon={Plus} onClick={openNew}>{tr("New employee")}</Button>}
      />
      <EmployeeForm open={formOpen} onClose={() => setFormOpen(false)} initial={editing} onSaved={refetch} />
      <ConfirmDialog
        open={!!del.target}
        onClose={() => del.setTarget(null)}
        onConfirm={del.confirm}
        loading={del.busy}
        title={del.target?.ids ? `Delete ${del.target.ids.length} employees?` : "Delete employee?"}
        description="Their tasks will be kept but become unassigned. Project memberships are removed."
      />
    </>
  );
}
