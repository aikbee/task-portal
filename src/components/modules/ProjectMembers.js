"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { UserPlus, X, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { fullName, formatDate } from "@/lib/utils";
import { EMPLOYEE_STATUS, MEMBER_ROLES } from "@/lib/modules";
import Card, { CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import MultiSelect from "@/components/ui/MultiSelect";
import Avatar from "@/components/ui/Avatar";
import { StatusBadge } from "@/components/ui/Badge";
import { Field, Select } from "@/components/ui/Controls";
import { EmptyState } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/lib/i18n";

export default function ProjectMembers({ project, onChange }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState([]);
  const [role, setRole] = useState("Member");
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { data: employees } = useFetch(open ? "/api/employees" : null);

  const memberIds = new Set(project.employees.map((e) => e.id));
  const options = useMemo(
    () =>
      (employees ?? [])
        .filter((e) => !memberIds.has(e.id))
        .map((e) => ({ value: e.id, label: fullName(e), sub: e.job_title, color: e.avatar_color })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [employees, project.employees]
  );

  const add = async () => {
    setSaving(true);
    try {
      onChange(await api.post(`/api/projects/${project.id}/employees`, { employees: picked.map((employee_id) => ({ employee_id, role })) }));
      toast.success(`${picked.length} member${picked.length > 1 ? "s" : ""} added`);
      setOpen(false);
      setPicked([]);
    } catch (e) {
      toast.error("Could not add members", e.message);
    } finally {
      setSaving(false);
    }
  };
  const setMemberRole = async (employee_id, newRole) => {
    try {
      onChange(await api.post(`/api/projects/${project.id}/employees`, { employee_id, role: newRole }));
    } catch (e) {
      toast.error("Could not update role", e.message);
    }
  };
  const remove = async (employee_id) => {
    try {
      onChange(await api.del(`/api/projects/${project.id}/employees`, { body: { employee_id } }));
      toast.success("Member removed");
    } catch (e) {
      toast.error("Could not remove member", e.message);
    }
  };

  return (
    <Card padding={false}>
      <CardHeader
        className="px-5 pt-5"
        icon={Users}
        title="Team members"
        description={`${project.employees.length} employee${project.employees.length === 1 ? "" : "s"} on this project`}
        actions={<Button size="sm" icon={UserPlus} onClick={() => setOpen(true)}>Add members</Button>}
      />
      {project.employees.length === 0 ? (
        <EmptyState compact icon={Users} title="No members yet" description="Assign employees so their tasks can be tracked under this project." action={<Button size="sm" icon={UserPlus} onClick={() => setOpen(true)}>Add members</Button>} />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table w-full text-sm">
            <thead>
              <tr className="border-y border-line bg-surface-2/60 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
                <th>{tr("Employee")}</th>
                <th>{tr("Department")}</th>
                <th>{tr("Status")}</th>
                <th>Role on project</th>
                <th className="text-right">Tasks here</th>
                <th>Since</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {project.employees.map((e) => (
                <tr key={e.id} className="border-b border-line/70 last:border-0 hover:bg-surface-2/60">
                  <td>
                    <Link href={`/employees/${e.id}`} className="inline-flex items-center gap-2.5 hover:opacity-80">
                      <Avatar name={fullName(e)} color={e.avatar_color} size="sm" />
                      <span className="leading-tight">
                        <span className="block font-medium">{fullName(e)}</span>
                        <span className="block text-[11px] text-fg-muted">{e.job_title}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="text-fg-muted">{e.department || "—"}</td>
                  <td><StatusBadge map={EMPLOYEE_STATUS} value={e.status} /></td>
                  <td>
                    <RoleSelect value={e.role} onChange={(r) => setMemberRole(e.id, r)} />
                  </td>
                  <td className="text-right tabular-nums">{e.task_count}</td>
                  <td className="text-fg-muted">{formatDate(e.assigned_at)}</td>
                  <td className="text-right">
                    <Button variant="dangerGhost" size="iconXs" icon={X} onClick={() => remove(e.id)} aria-label={tr("Remove")} data-tip="Remove from project" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add team members"
        description={`Assign employees to ${project.name}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>{tr("Cancel")}</Button>
            <Button onClick={add} loading={saving} disabled={!picked.length}>Add {picked.length || ""} member{picked.length === 1 ? "" : "s"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={tr("Employees")}>
            <MultiSelect options={options} value={picked} onChange={setPicked} placeholder={options.length ? "Pick employees…" : "Everyone is already a member"} />
          </Field>
          <Field label="Role on project">
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              {MEMBER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

function RoleSelect({ value, onChange }) {
  const opts = value && !MEMBER_ROLES.includes(value) ? [value, ...MEMBER_ROLES] : MEMBER_ROLES;
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} className="control h-8 w-auto cursor-pointer py-0 pr-7 text-xs">
      <option value="">— none —</option>
      {opts.map((r) => <option key={r} value={r}>{r}</option>)}
    </select>
  );
}
