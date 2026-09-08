"use client";
import { createContext, useContext, useEffect, useMemo } from "react";
import { setDateLocale } from "./utils";

import { LOCALES, LOCALE_COOKIE } from "./i18n-config";
export { LOCALES, LOCALE_COOKIE };

/** zh-CN dictionary keyed by the English source string. Missing keys fall back to English. */
const zhCN = {
  // shell
  "Task Portal": "任务门户", "Control center": "控制中心", Modules: "模块", Profile: "档案", "Switch profile": "切换档案", "New profile": "新建档案", "Manage profiles": "管理档案", default: "默认",
  Dashboard: "仪表盘", Projects: "项目", Requirements: "需求", Employees: "员工", Tasks: "任务", Info: "资料", Board: "看板", Calendar: "日历", Profiles: "档案", Notifications: "通知", Users: "用户",
  Project: "项目", Requirement: "需求", Employee: "员工", Task: "任务", "Info item": "资料", User: "用户", Notification: "通知",
  "Make it yours": "打造你的工作区", "Theme, accent, background and layout live in Preferences.": "主题、强调色、背景和布局都在“偏好设置”中。", "Open preferences": "打开偏好设置", "Hide this card": "隐藏此卡片",
  "{n} sticky note saved": "已保存 {n} 条便签", "{n} sticky notes saved": "已保存 {n} 条便签", Collapse: "收起", Expand: "展开",
  "Toggle sidebar": "切换侧边栏", Back: "后退", Forward: "前进", "Pin page": "固定页面", "Unpin page": "取消固定", "Pin this page": "固定此页面", "Search projects, people, tasks…": "搜索项目、人员、任务…", "Searching…": "搜索中…", "No results for “{q}”.": "没有找到“{q}”。", navigate: "导航", open: "打开", close: "关闭",
  New: "新建", "New {x}": "新建{x}", "Toggle theme": "切换主题", "Theme: {theme}": "主题：{theme}", Preferences: "偏好设置", "Account menu": "账户菜单", "Profile & password": "个人资料与密码", "Lock screen": "锁屏", "Set up lock screen": "设置锁屏", "Sign out": "退出登录", "Split view": "分栏视图", "Single page": "单页", "Two pages side by side": "两页并排", "Three pages side by side": "三页并排", "Open this page in a pane": "在分栏中打开此页", Workspace: "工作区", "My workspace": "我的工作区", "Switch workspace (admin)": "切换工作区（管理员）", "No other users yet": "还没有其他用户", Language: "语言",
  "Viewing {name}’s workspace ({email}). Projects, employees and tasks you create or change here belong to them.": "正在查看 {name} 的工作区（{email}）。你在此创建或修改的项目、员工和任务都属于该用户。", "Back to my workspace": "返回我的工作区",
  Notes: "便签", Timer: "计时器", Calculator: "计算器", Shortcuts: "快捷键", "Back to top": "回到顶部", "Density: {density}": "密度：{density}", "Lock screen ⌘⇧L": "锁屏 ⌘⇧L", "DB offline": "数据库离线", "Checking…": "检查中…",
  "New note": "新建便签", Title: "标题", "Write something…": "写点什么…", "No notes for {module}": "{module} 没有便签", "Sticky notes are scoped to the module you're working in. Add one to keep context close.": "便签按当前模块归类。添加一条，随时保留上下文。", Pin: "固定", Unpin: "取消固定", Delete: "删除", "Saving…": "保存中…",
  Focus: "专注", Cooldown: "休息", Start: "开始", Resume: "继续", Pause: "暂停", Reset: "重置", "Focus length": "专注时长", "Cooldown length": "休息时长", min: "分钟", "Settings are saved. The timer keeps running while the panel is closed.": "设置已保存。关闭面板后计时器仍会继续运行。", "When a session ends": "一段结束时", "Pop-up": "弹窗", Toast: "提示", Silent: "静默", "Play a chime": "播放提示音", "Short sound when time is up": "时间到时播放短音", Test: "测试", "Desktop notification": "桌面通知", "Also alerts when this tab is in the background": "标签页在后台时也会提醒", "Auto-start next session": "自动开始下一段", "Cooldown follows focus automatically, and vice versa": "专注后自动休息，反之亦然",
  "Focus session complete": "专注时段已完成", "Cooldown finished": "休息结束", "Nice work — time for a {n}-minute cooldown.": "干得好——休息 {n} 分钟吧。", "Break's over. Ready for a {n}-minute focus session?": "休息结束，准备开始 {n} 分钟的专注吗？", "Got it": "知道了", Dismiss: "关闭", "Start {label} · {n} min": "开始{label} · {n} 分钟", focus: "专注", cooldown: "休息",
  History: "历史", clear: "清除", Navigation: "导航", Pages: "页面", "Search everything": "全局搜索", "Sticky notes": "便签", "New record (on list pages)": "新建记录（列表页）", "Close dialog / panel": "关闭对话框/面板", "This cheat-sheet": "此速查表", "Pin / unpin current page": "固定/取消固定当前页", Search: "搜索", "Move selection": "移动选择", "Open result": "打开结果", Lists: "列表",
  // preferences
  "Personalise the workspace. Saved in this browser.": "个性化工作区。保存在此浏览器中。", Appearance: "外观", Theme: "主题", Light: "浅色", Dark: "深色", System: "跟随系统", "Accent colour": "强调色", "Corner radius": "圆角", Sharp: "直角", Rounded: "圆角", Soft: "柔和", "Frosted glass panels": "磨砂玻璃面板", "Translucent, blurred surfaces": "半透明的模糊表面",
  Background: "背景", Aurora: "极光", Mesh: "渐变网格", Orbs: "光球", Bubbles: "气泡", Stars: "星空", Waves: "波浪", Hexagons: "蜂窝", Sunrise: "日出", Grid: "网格", None: "无", "Soft drifting ribbons": "柔和飘动的光带", "Colour-shifting gradient": "变色渐变", "Floating glowing balls": "漂浮的发光球", "Rising soap bubbles": "上升的肥皂泡", "Twinkling starfield": "闪烁的星空", "Ribbons rolling along the bottom": "底部滚动的光带", "Honeycomb with a roaming light": "带游走光斑的蜂窝", "Horizon glow and a breathing sun": "地平线光晕与呼吸的太阳", "Perspective floor": "透视地板", "Plain background": "纯色背景", Intensity: "强度", Subtle: "淡", Normal: "正常", Vivid: "鲜明", Shuffle: "随机", "Animate background": "背景动画", "Pause to save battery": "暂停以省电", "Reduce motion": "减少动效", "Disable UI transitions": "关闭界面过渡动画",
  Layout: "布局", "Comfortable": "舒适", Compact: "紧凑", "Split view": "分栏视图", "1 page": "1 页", "2 pages": "2 页", "3 pages": "3 页", "Show other pages beside the main one; drag the dividers to resize": "在主页面旁显示其他页面；拖动分隔线调整大小", "Collapse sidebar": "收起侧边栏", "Icons only": "仅显示图标", "Show bottom bar": "显示底栏", "Sticky notes and utilities": "便签与小工具", "Show pinned pages bar": "显示固定页面栏", "Quick-switch strip under the header": "顶栏下方的快速切换条", "Show sidebar tip card": "显示侧边栏提示卡片", "The “Make it yours” card": "“打造你的工作区”卡片", "Default rows per page": "默认每页行数", "{n} rows": "{n} 行",
  Editing: "编辑", "Autosave delay": "自动保存延迟", "Task outputs and sticky notes save this long after you stop typing. Blur, ⌘S or the Save button save immediately.": "停止输入后经过此时长自动保存任务输出和便签。失焦、⌘S 或“保存”按钮会立即保存。", "Manual only (no autosave)": "仅手动（不自动保存）", "1 second": "1 秒", "2 seconds": "2 秒", "3 seconds": "3 秒", "5 seconds": "5 秒", "10 seconds": "10 秒", "30 seconds": "30 秒",
  "Focus (minutes)": "专注（分钟）", "Cooldown (minutes)": "休息（分钟）",
  "Reset preferences": "重置偏好设置", "Clear table layouts": "清除表格布局", "Clear pinned pages": "清除固定页面", "Preferences reset": "偏好设置已重置", "Table layouts cleared": "表格布局已清除", "Pinned pages cleared": "固定页面已清除",
  // lock screen / pin
  "Lock screen appearance": "锁屏外观", "Follow app": "跟随应用", "Independent of the app theme": "独立于应用主题", "Enable lock screen": "启用锁屏", "Lock from the account menu, the bottom bar, or ⌘⇧L": "可从账户菜单、底栏或 ⌘⇧L 锁定", "Set a PIN first": "请先设置 PIN", "Auto-lock after inactivity": "闲置后自动锁定", "No mouse or keyboard activity for this long locks the screen": "在此时长内没有鼠标或键盘操作即锁屏", Never: "从不", "After 1 minute": "1 分钟后", "After 2 minutes": "2 分钟后", "After 5 minutes": "5 分钟后", "After 10 minutes": "10 分钟后", "After 15 minutes": "15 分钟后", "After 30 minutes": "30 分钟后", "After 1 hour": "1 小时后", "Lock now": "立即锁定",
  "PIN set · {n} digits": "已设置 PIN · {n} 位", "No PIN set": "未设置 PIN", "Used to unlock this browser": "用于解锁此浏览器", "Create a PIN to enable the lock screen": "创建 PIN 以启用锁屏", Change: "更改", "Set PIN": "设置 PIN", "Create a PIN": "创建 PIN", "Change PIN": "更改 PIN", "Remove PIN": "移除 PIN", "Current PIN": "当前 PIN", "New PIN": "新 PIN", Confirm: "确认", "Save PIN": "保存 PIN", "{a}–{b} digits": "{a}–{b} 位数字", Cancel: "取消",
  "Workspace locked": "工作区已锁定", "Enter your {n}-digit PIN to continue": "输入 {n} 位 PIN 以继续", "Incorrect PIN.": "PIN 不正确。", "Too many attempts.": "尝试次数过多。", "Not {name}? Sign out": "不是{name}？退出登录", "Task Portal · type the PIN or use the keypad": "管理门户 · 输入 PIN 或使用键盘", "Signing out…": "正在退出…",
  // login
  "Sign in": "登录", "Use your account email and password.": "使用账户邮箱和密码。", "Your session has expired. Please sign in again.": "会话已过期，请重新登录。", Email: "邮箱", Password: "密码", "Keep me signed in for 30 days": "30 天内保持登录", "Demo accounts (development)": "演示账户（开发环境）", Admin: "管理员",
  // common
  Save: "保存", Saved: "已保存", "Save changes": "保存更改", Edit: "编辑", View: "查看", Close: "关闭", Add: "添加", Remove: "移除", Open: "打开", Copy: "复制", Copied: "已复制", Rename: "重命名", Download: "下载", Upload: "上传", Paste: "粘贴", Actions: "操作", Status: "状态", Priority: "优先级", Type: "类型", Name: "名称", Code: "代码", Description: "描述", Created: "创建时间", Updated: "更新时间", Start: "开始", End: "结束", Budget: "预算", Team: "团队", Progress: "进度", Due: "截止", "Due date": "截止日期", Assignee: "负责人", Unassigned: "未分配", Department: "部门", Role: "角色", Phone: "电话", Hired: "入职", Category: "分类", Tags: "标签", Summary: "摘要", Content: "内容", Contains: "包含", Files: "文件", Outputs: "输出", "Files / Outputs": "文件 / 输出", Members: "成员", Attachments: "附件", Details: "详情", Meta: "信息", About: "关于", Overview: "概览", Delivery: "交付", Stakeholder: "干系人", "Acceptance criteria": "验收标准", Sessions: "会话", "Last login": "最后登录", "Linked employee": "关联员工",
  "Are you sure?": "确定吗？", Yes: "是", No: "否", "Nothing here yet": "这里还没有内容", "No results": "没有结果", "Nothing matches \"{q}\".": "没有匹配“{q}”的内容。", "Nothing in the selected date range.": "所选日期范围内没有内容。", "Could not load data": "无法加载数据",
  // data table
  "Search…": "搜索…", "Clear search": "清除搜索", Columns: "列", "Columns & sort": "列与排序", "Display columns": "显示列", "Default sort: ": "默认排序：", saved: "已保存", Clear: "清除", Show: "显示", "Sort by": "排序", "Clicking a column header sorts for this visit only; the buttons here save your default for this page.": "点击列标题仅在本次访问中排序；此处的按钮会保存为此页面的默认排序。", "Show all columns and use the page's default sort": "显示全部列并使用页面默认排序", Export: "导出", "Export the visible columns as CSV": "将可见列导出为 CSV", Dates: "日期", "Date range": "日期范围", Field: "字段", From: "从", To: "到", Today: "今天", "Last 7 days": "最近 7 天", "Last 30 days": "最近 30 天", "This month": "本月", "Next 30 days": "未来 30 天", "Before today": "今天之前", "Leave one side empty for an open-ended range. Rows without a {field} are hidden while a range is active.": "留空一侧表示开放区间。启用范围时，没有{field}的行会被隐藏。", Rows: "行", Page: "页码", "{from}–{to} of {total}": "{from}–{to}，共 {total}", "(filtered from {n})": "（从 {n} 条中筛选）", "{n} rows": "{n} 行", "0 rows": "0 行", "{n} selected": "已选 {n} 项", "Select all": "全选", "Select row": "选择行", "First page": "第一页", "Previous page": "上一页", "Next page": "下一页", "Last page": "最后一页",
  // statuses & enums
  Planning: "规划中", Active: "进行中", "On hold": "暂停", Completed: "已完成", Archived: "已归档", "On leave": "休假", Inactive: "停用", "To do": "待办", "In progress": "进行中", "In review": "审核中", Done: "已完成", Low: "低", Medium: "中", High: "高", Urgent: "紧急", Functional: "功能性", "Non-functional": "非功能性", Technical: "技术", Business: "业务", Constraint: "约束", "Must have": "必须", "Should have": "应该", "Could have": "可以", "Won't have": "不做", Draft: "草稿", Approved: "已批准", Rejected: "已拒绝", Guideline: "指南", Credential: "凭据", Link: "链接", Note: "笔记", Other: "其他", Disabled: "已禁用",
  // lists & forms
  "New project": "新建项目", "New employee": "新建员工", "New task": "新建任务", "New requirement": "新建需求", "New user": "新建用户", "New info": "新建资料", "All statuses": "全部状态", "All departments": "全部部门", "All projects": "全部项目", "Any priority": "任意优先级", Anyone: "任何人", "All types": "全部类型", "All roles": "全部角色", "All categories": "全部分类", "All tags": "全部标签", "Search projects…": "搜索项目…", "Search people…": "搜索人员…", "Search tasks…": "搜索任务…", "Search requirements…": "搜索需求…", "Search users…": "搜索用户…", "Search titles, summaries, tags…": "搜索标题、摘要、标签…",
  "Projects group employees and tasks together.": "项目将员工和任务组织在一起。", "People who belong to projects and own tasks.": "参与项目并负责任务的人员。", "Units of work with attachments and long-form outputs.": "带附件和长文本输出的工作单元。", "What each project must deliver, prioritised and tracked.": "每个项目必须交付的内容，排定优先级并跟踪。", "Login accounts and roles (admin / user).": "登录账户与角色（管理员 / 用户）。", "Guidelines, credentials, links and reference notes — each with its own notes and attachments.": "指南、凭据、链接和参考笔记——每条都有自己的备注和附件。", "Kanban board — drag tasks between columns to change status, priority or assignee.": "看板——在列之间拖动任务以更改状态、优先级或负责人。", "Tasks by due date — month, week and agenda views. Drag a task to reschedule it.": "按截止日期查看任务——月、周和日程视图。拖动任务即可改期。", "Separate sets of projects, requirements, employees and tasks. Switch any time.": "彼此独立的项目、需求、员工和任务集合，可随时切换。", "What changed in your workspace, reminders and security alerts.": "工作区的变动、提醒和安全警报。", "Overview of projects, people and work in flight.": "项目、人员和进行中工作的总览。",
  "No projects yet": "还没有项目", "Create your first project to start grouping employees and tasks.": "创建第一个项目，开始组织员工和任务。", "No employees yet": "还没有员工", "Add people so they can be assigned to projects and tasks.": "添加人员，以便分配到项目和任务。", "No tasks yet": "还没有任务", "Tasks hold attachments and long-form outputs, each with their own ordering.": "任务包含附件和长文本输出，各自可排序。", "No requirements yet": "还没有需求",
  "Delete project?": "删除项目？", "Delete employee?": "删除员工？", "Delete task?": "删除任务？", "Delete requirement?": "删除需求？", "Delete user?": "删除用户？", "Delete this info item?": "删除此资料？",
  "Good morning": "早上好", "Good afternoon": "下午好", "Good evening": "晚上好", "Here's what's happening in": "以下是当前动态：", "Open tasks": "待处理任务", Overdue: "逾期", "{n} active": "{n} 个进行中", "{n} total": "共 {n} 个", "Needs attention": "需要关注", "All on track": "一切正常", "Tasks by status": "按状态统计任务", "Project progress": "项目进度", "Active, planned and on-hold": "进行中、规划中和暂停的项目", "Team workload": "团队工作量", "Open tasks per active employee": "每位在职员工的待处理任务", "Upcoming deadlines": "即将到期", "Open tasks by due date": "按截止日期排列的待处理任务", "Recently updated tasks": "最近更新的任务", "All people": "全部人员", "{a}/{b} tasks · {n} people": "{a}/{b} 个任务 · {n} 人", "due {date}": "截止 {date}", "no end date": "无结束日期", "{n} open": "{n} 个待处理", "All tasks": "全部任务", "Nothing due": "没有到期项", "No employees": "没有员工", "No projects": "没有项目", "{n} tasks": "{n} 个任务", "{n} task": "{n} 个任务", "{n} sticky notes": "{n} 条便签", "{n} sticky note": "{n} 条便签",
  // notifications
  "Mark all read": "全部标为已读", "View all": "查看全部", "You’re all caught up": "没有新通知", "Changes, reminders and sign-ins will show up here.": "变动、提醒和登录记录会显示在这里。", Unread: "未读", All: "全部", "Clear read": "清除已读", "Mark read": "标为已读", "Mark unread": "标为未读", "No unread notifications": "没有未读通知", Reminders: "提醒", Accounts: "账户", Security: "安全", "Receive": "接收", "Announce (this browser)": "提醒方式（此浏览器）", "When a new notification arrives": "有新通知时", "When this tab is in the background": "当此标签页在后台时",
  // board / calendar
  "Filter cards…": "筛选卡片…", "Drop tasks here": "把任务拖到这里", "Add task": "添加任务", "Task title, then Enter": "输入任务标题后按 Enter", "New task here": "在此新建任务", Month: "月", Week: "周", Agenda: "日程", "Hide done": "隐藏已完成", Deadlines: "截止日期", "{n} tasks in view": "视图中有 {n} 个任务", "Pick a day": "选择一天", "Click a day to see its tasks here. Double-click a day to add a task.": "点击某天在此查看任务，双击某天添加任务。", "No tasks are due on this day.": "这一天没有到期任务。", "Nothing scheduled": "没有安排",
  // tool workspace
  "Collapse to panel": "收起为面板", "All notes": "全部便签", "Search notes…": "搜索便签…", "All modules": "全部模块", "No notes match": "没有匹配的便签", "Untitled note": "未命名便签", "Open in editor": "在编辑器中打开", "No calculations yet": "还没有计算记录", Backspace: "退格", Calculator: "计算器",
  // push
  "Push (this device)": "推送（此设备）", "Push notifications": "推送通知", "Task reminders and updates, even when the app is closed": "任务提醒和更新，即使应用未打开", "Blocked in browser settings": "已在浏览器设置中阻止", "Push notifications are not supported in this browser. On iPhone, add the app to the Home Screen first.": "此浏览器不支持推送通知。在 iPhone 上，请先将应用添加到主屏幕。", "Push notifications enabled": "已启用推送通知", "Test notification sent": "已发送测试通知",
  // mobile + pwa
  "Install app": "安装应用", "Close menu": "关闭菜单", "You're offline": "你已离线", "This page needs a connection. Check your network and try again.": "此页面需要网络连接。请检查网络后重试。", Retry: "重试",
  // mentions
  Linked: "关联", "@ tags a person, project, task, requirement or info item · paste a copied table to add a grid": "输入 @ 可标记人员、项目、任务、需求或资料 · 粘贴复制的表格可添加网格", "Tag “{q}”": "标记“{q}”", "Type to search people, projects, tasks, requirements and info": "输入以搜索人员、项目、任务、需求和资料",
  // task assignee
  "Change assignee": "更改负责人", "Reassign this task?": "重新分配此任务？", "Remove the assignee?": "移除负责人？", "“{title}” moves from {from} to {to}. It shows up in their tasks and workload right away.": "“{title}”将从 {from} 转给 {to}。任务会立即出现在对方的任务和工作量中。", "“{title}” will no longer be assigned to {from}.": "“{title}”将不再分配给 {from}。", Reassign: "重新分配", "Reassigned to {name}": "已重新分配给 {name}", "Assignee removed": "已移除负责人",
  // outputs / notes blocks
  Text: "文本", Table: "表格", "Insert table": "插入表格", Preview: "预览", "Add row": "添加行", "Add column": "添加列", "Delete row": "删除行", "Delete column": "删除列", "{r} rows · {c} columns": "{r} 行 · {c} 列", "{r} × {c} table": "{r} × {c} 表格", "Paste a copied table, TSV or CSV to fill a table automatically": "粘贴复制的表格、TSV 或 CSV 可自动填充表格", "Enter adds a row · Tab moves between cells · paste fills cells": "Enter 新增一行 · Tab 在单元格间移动 · 粘贴可填充单元格", "Pasted as a table": "已粘贴为表格", "Pasted as an inline table": "已粘贴为行内表格", "Keep as text": "保留为文本", Undo: "撤销", "Type anywhere · tables are edited in place · paste a copied table to add one": "随处输入 · 表格可直接编辑 · 粘贴复制的表格即可添加", "Insert table here": "在此插入表格", "Delete table": "删除表格", "Table deleted": "表格已删除", "Add text…": "添加文本…", "Paste as text instead": "改为粘贴为文本", "{n} tables": "{n} 个表格", "{n} table": "{n} 个表格", "Convert this text to a table?": "将此文本转换为表格？", "Each line becomes a row. Switching back to Text right away restores your text unchanged; after editing the table you get a Markdown table instead.": "每一行将成为一行表格。立即切换回“文本”可原样恢复；编辑表格后切回则会得到 Markdown 表格。", Convert: "转换", "Proportional font": "比例字体", "Monospace font": "等宽字体", "⌘S saves": "⌘S 保存", "Copy as TSV": "复制为 TSV", "Collapse all": "全部收起", "Expand all": "全部展开", "Add output": "添加输出", "Add note": "添加备注", "Add first output": "添加第一条输出", "Add first note": "添加第一条备注", "No outputs yet": "还没有输出", "No notes yet": "还没有备注",
  // info search
  "Search info": "搜索资料", "Search titles, content, notes and attachments…": "搜索标题、内容、备注和附件…", "Type to search your info vault.": "输入关键词搜索资料库。", "Recent searches": "最近搜索", "Search in": "搜索范围", "Pinned only": "仅已固定", "{n} results": "{n} 条结果", "{n} result": "{n} 条结果", "in {ms} ms": "用时 {ms} 毫秒", "No matches": "没有匹配项", "Try fewer words, or search another field.": "试试更少的词，或搜索其他字段。", "Open item": "打开资料", "Title & summary": "标题与摘要",
};

const DICTS = { en: {}, "zh-CN": zhCN };

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** translate(locale, key, vars) — key is the English text; unknown keys return the English text. */
export function translate(locale, key, vars) {
  const dict = DICTS[locale] ?? DICTS.en;
  const hit = dict[key];
  return interpolate(hit ?? key, vars);
}

const I18nContext = createContext("en");

export function I18nProvider({ locale = "en", children }) {
  useEffect(() => {
    setDateLocale(locale === "en" ? undefined : locale);
    document.documentElement.lang = locale;
  }, [locale]);
  return <I18nContext.Provider value={locale}>{children}</I18nContext.Provider>;
}

export function useLocale() {
  return useContext(I18nContext);
}

/** t("English text", { vars }) */
export function useT() {
  const locale = useContext(I18nContext);
  return useMemo(() => (key, vars) => translate(locale, key, vars), [locale]);
}

/** Persist the choice (cookie for SSR + reload so every screen re-renders in the new language). */
export function switchLocale(locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}
