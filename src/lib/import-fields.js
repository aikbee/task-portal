/**
 * What can be imported from a spreadsheet, per record type. Shared by the dialog (mapping, template) and the
 * server (validation). `aliases` are header names that map to the field on their own; matching ignores case,
 * spaces and punctuation.
 */
export const IMPORT_KINDS = {
  tasks: {
    label: "Tasks",
    singular: "task",
    fields: {
      title: { label: "Title", required: true, max: 200, aliases: ["task", "name", "summary", "subject", "标题", "任务", "任务名称", "名称"] },
      description: { label: "Description", type: "long", aliases: ["details", "notes", "body", "描述", "说明", "备注", "详情"] },
      project: { label: "Project", type: "ref", aliases: ["project name", "project code", "项目", "项目名称"] },
      requirement: { label: "Requirement", type: "ref", aliases: ["req", "requirement code", "story", "需求"] },
      assignees: { label: "Assignees", type: "people", aliases: ["assignee", "assigned to", "assigned", "owner", "employee", "person", "people", "responsible", "负责人", "指派给", "执行人", "成员"] },
      status: { label: "Status", type: "enum", aliases: ["state", "状态"] },
      priority: { label: "Priority", type: "enum", aliases: ["prio", "importance", "优先级"] },
      start_date: { label: "Start date", type: "date", aliases: ["start", "starts", "from", "开始日期", "开始"] },
      due_date: { label: "Due date", type: "date", aliases: ["due", "deadline", "end", "end date", "finish", "截止日期", "截止", "到期日", "期限"] },
      estimate_hours: { label: "Estimate (hours)", type: "number", aliases: ["estimate", "hours", "estimated hours", "effort", "预估工时", "工时", "预估"] },
      tags: { label: "Tags", type: "tags", aliases: ["labels", "label", "tag", "category", "标签", "分类"] },
    },
    example: ["Write the launch checklist", "Everything that must be true before go-live", "Orion", "", "Jane Lee; Ken Tan", "In progress", "High", "2026-10-01", "2026-10-15", "6", "launch, docs"],
  },
  employees: {
    label: "Employees",
    singular: "employee",
    fields: {
      name: { label: "Full name", type: "fullname", aliases: ["employee", "person", "full name", "display name", "姓名", "名字", "员工", "员工姓名"] },
      first_name: { label: "First name", max: 80, aliases: ["first", "given name", "forename", "名"] },
      last_name: { label: "Last name", max: 80, aliases: ["last", "surname", "family name", "姓"] },
      email: { label: "Email", type: "email", max: 190, aliases: ["e-mail", "mail", "email address", "邮箱", "电子邮件", "邮件"] },
      phone: { label: "Phone", max: 40, aliases: ["mobile", "telephone", "tel", "phone number", "电话", "手机", "手机号"] },
      job_title: { label: "Job title", max: 120, aliases: ["title", "position", "role", "job", "职位", "岗位", "职务"] },
      department: { label: "Department", max: 120, aliases: ["team", "dept", "unit", "division", "部门", "团队"] },
      status: { label: "Status", type: "enum", aliases: ["state", "状态"] },
      hired_at: { label: "Hired on", type: "date", aliases: ["hired", "hire date", "joined", "start date", "since", "入职日期", "入职"] },
    },
    example: ["Jane Lee", "", "", "jane@example.com", "+60 12 345 6789", "Product designer", "Design", "Active", "2024-03-01"],
  },
  projects: {
    label: "Projects",
    singular: "project",
    fields: {
      name: { label: "Name", required: true, max: 160, aliases: ["project", "project name", "title", "项目", "项目名称", "名称"] },
      code: { label: "Code", type: "code", max: 12, aliases: ["key", "project code", "short code", "abbreviation", "代码", "编号", "项目代码"] },
      description: { label: "Description", type: "long", aliases: ["details", "notes", "summary", "描述", "说明", "备注"] },
      status: { label: "Status", type: "enum", aliases: ["state", "phase", "状态"] },
      start_date: { label: "Start date", type: "date", aliases: ["start", "starts", "from", "kick-off", "开始日期", "开始"] },
      end_date: { label: "End date", type: "date", aliases: ["end", "deadline", "due", "due date", "finish", "until", "结束日期", "截止日期", "结束"] },
      budget: { label: "Budget", type: "number", aliases: ["cost", "amount", "预算"] },
    },
    example: ["Orion customer portal", "ORION", "Self-service portal for customers", "Active", "2026-09-01", "2026-12-15", "120000"],
  },
  requirements: {
    label: "Requirements",
    singular: "requirement",
    fields: {
      project: { label: "Project", type: "ref", required: true, aliases: ["project name", "project code", "项目", "项目名称"] },
      title: { label: "Title", required: true, max: 200, aliases: ["requirement", "name", "summary", "story", "标题", "需求", "需求名称", "名称"] },
      code: { label: "Code", type: "reqcode", max: 32, aliases: ["id", "key", "ref", "requirement code", "代码", "编号", "需求编号"] },
      description: { label: "Description", type: "long", aliases: ["details", "notes", "body", "描述", "说明", "备注"] },
      acceptance_criteria: { label: "Acceptance criteria", type: "long", aliases: ["acceptance", "criteria", "done when", "definition of done", "验收标准", "验收"] },
      type: { label: "Type", type: "enum", aliases: ["kind", "category", "类型"] },
      priority: { label: "Priority", type: "enum", aliases: ["prio", "moscow", "importance", "优先级"] },
      status: { label: "Status", type: "enum", aliases: ["state", "状态"] },
      employee: { label: "Stakeholder", type: "ref", aliases: ["owner", "requested by", "requester", "assignee", "person", "contact", "负责人", "相关人", "提出人", "干系人"] },
    },
    example: ["Orion", "Customers can reset their own password", "", "Reset by email link, valid for one hour", "Link works once; old sessions are signed out", "Functional", "Must have", "Approved", "Jane Lee"],
  },
};

export const IMPORT_MAX_ROWS = 2000;

/** "Due Date " -> "due date": how headers and aliases are compared. */
export const normaliseHeader = (h) => String(h ?? "").toLowerCase().replace(/[_\-./]+/g, " ").replace(/[^\p{L}\p{N} ]+/gu, "").replace(/\s+/g, " ").trim();

/** Guess the target field of each column from its header; null when nothing fits. Each field is used once. */
export function autoMap(kind, headers) {
  const spec = IMPORT_KINDS[kind];
  const taken = new Set();
  return headers.map((h) => {
    const key = normaliseHeader(h);
    if (!key) return null;
    for (const [field, f] of Object.entries(spec.fields)) {
      if (taken.has(field)) continue;
      if ([field, f.label, ...(f.aliases ?? [])].some((a) => normaliseHeader(a) === key)) { taken.add(field); return field; }
    }
    return null;
  });
}

/** Does the first row look like a header line rather than data? (enough cells match known field names) */
export function looksLikeHeader(kind, row) {
  const hits = autoMap(kind, row).filter(Boolean).length;
  return hits >= Math.max(1, Math.ceil(row.filter((c) => String(c).trim()).length / 3));
}

/** The template a person downloads: the field labels as headers plus one example row. */
export function templateRows(kind) {
  const spec = IMPORT_KINDS[kind];
  return [Object.values(spec.fields).map((f) => f.label), spec.example];
}
