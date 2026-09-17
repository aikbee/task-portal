"use client";
import { useEffect, useMemo, useState } from "react";
import { MessageSquare, History, Send, Pencil, Trash2, Plus, ArrowRight, Paperclip, FileText, CheckSquare, ListChecks } from "lucide-react";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { useAccess } from "@/lib/auth-context";
import { TASK_STATUS, TASK_PRIORITY } from "@/lib/constants";
import { displayMentions } from "@/lib/mentions";
import { REPEAT_RULES } from "@/lib/recurrence";
import { cn, formatDate, formatDateTime, relativeTime } from "@/lib/utils";
import Card, { CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import BlockEditor from "@/components/ui/BlockEditor";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Segmented } from "@/components/ui/Controls";
import { RenderedText } from "@/components/ui/TextBlocks";
import { MentionChips } from "@/components/ui/Mentions";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/lib/i18n";

const FIELD_LABEL = { title: "the title", status: "the status", priority: "the priority", start_date: "the start date", due_date: "the due date", estimate: "the estimate", assignee: "the assignees", project: "the project", requirement: "the requirement", tags: "the tags", repeat: "the repeat setting", repeat_until: "the repeat end date" };
const ACTION_ICON = { created: Plus, updated: ArrowRight, attachment_added: Paperclip, attachment_removed: Paperclip, output_added: FileText, output_removed: FileText, checklist_added: ListChecks, checklist_removed: ListChecks, checklist_done: CheckSquare, checklist_undone: CheckSquare };

/** A history row as a sentence. Status and priority are stored as keys and translated here; dates are formatted. */
function sentence(h, tr) {
  const show = (v) => {
    if (v == null) return "";
    if (h.field === "status") return tr(TASK_STATUS[v]?.label ?? v);
    if (h.field === "priority") return tr(TASK_PRIORITY[v]?.label ?? v);
    if (h.field === "start_date" || h.field === "due_date" || h.field === "repeat_until") return formatDate(v);
    if (h.field === "repeat") return tr(REPEAT_RULES[v]?.label ?? v);
    return v;
  };
  const who = h.actor_name || tr("Someone");
  const old = show(h.old_value), next = show(h.new_value);
  switch (h.action) {
    case "created": return tr("{who} created this task", { who });
    case "attachment_added": return tr("{who} attached {name}", { who, name: next });
    case "attachment_removed": return tr("{who} removed the file {name}", { who, name: old });
    case "output_added": return next ? tr("{who} added the output “{name}”", { who, name: next }) : tr("{who} added an output", { who });
    case "output_removed": return old ? tr("{who} removed the output “{name}”", { who, name: old }) : tr("{who} removed an output", { who });
    case "repeat_spawned": return tr("{who} completed it, and the next one was created for {date}", { who, date: next ? formatDate(next) : "" });
    case "created_from_repeat": return tr("Created as the next task of a repeating series ({from})", { from: old });
    case "dependency_added": return tr("{who} made this task wait for “{name}”", { who, name: next });
    case "dependency_removed": return tr("{who} removed the dependency on “{name}”", { who, name: old });
    case "checklist_added": return tr("{who} added the checklist item “{name}”", { who, name: next });
    case "checklist_removed": return tr("{who} removed the checklist item “{name}”", { who, name: old });
    case "checklist_done": return tr("{who} ticked off “{name}”", { who, name: next });
    case "checklist_undone": return tr("{who} reopened “{name}”", { who, name: next });
    default: {
      if (h.field === "description") return tr("{who} edited the description", { who });
      const field = tr(FIELD_LABEL[h.field] ?? h.field ?? "");
      if (old && next) return tr("{who} changed {field} from {old} to {next}", { who, field, old, next });
      if (next) return tr("{who} set {field} to {next}", { who, field, next });
      return tr("{who} cleared {field} (was {old})", { who, field, old });
    }
  }
}

/** Comments and the change history of a task on one timeline. */
export default function TaskActivity({ taskId, version, onCount }) {
  const tr = useT();
  const toast = useToast();
  const { canEdit } = useAccess();
  const comments = useFetch(`/api/tasks/${taskId}/comments`);
  const history = useFetch(`/api/tasks/${taskId}/history`);
  const [view, setView] = useState("all");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(null); // { id, body }
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  // the task changed elsewhere on the page (status, files, outputs…): pick up the new history rows
  const refetchHistory = history.refetch;
  useEffect(() => {
    if (version) refetchHistory();
  }, [version, refetchHistory]);

  const items = useMemo(() => {
    const c = (comments.data ?? []).map((x) => ({ kind: "comment", key: `c${x.id}`, at: x.created_at, ...x }));
    const h = (history.data ?? []).map((x) => ({ kind: "history", key: `h${x.id}`, at: x.created_at, ...x }));
    const all = view === "comments" ? c : view === "history" ? h : [...c, ...h];
    return all.sort((a, b) => new Date(a.at) - new Date(b.at) || (a.key < b.key ? -1 : 1));
  }, [comments.data, history.data, view]);

  const setComments = (rows) => {
    comments.setData(rows);
    onCount?.(rows.length);
  };
  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const res = await api.post(`/api/tasks/${taskId}/comments`, { body });
      setComments(res.items);
      setDraft("");
    } catch (e) {
      toast.error(tr("Could not post the comment"), e.message);
    } finally {
      setSending(false);
    }
  };
  const saveEdit = async () => {
    if (!editing?.body.trim()) return;
    setBusy(true);
    try {
      setComments(await api.put(`/api/tasks/${taskId}/comments/${editing.id}`, { body: editing.body }));
      setEditing(null);
    } catch (e) {
      toast.error(tr("Could not save the comment"), e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      setComments(await api.del(`/api/tasks/${taskId}/comments/${toDelete.id}`));
      setToDelete(null);
    } catch (e) {
      toast.error(tr("Could not delete the comment"), e.message);
    } finally {
      setBusy(false);
    }
  };

  const nComments = comments.data?.length ?? 0;
  return (
    <Card id="activity" className="task-activity scroll-mt-4">
      <CardHeader
        icon={MessageSquare}
        title={tr("Activity")}
        description={tr("{c} comments · {h} changes", { c: nComments, h: history.data?.length ?? 0 })}
        actions={<Segmented size="sm" value={view} onChange={setView} options={[{ value: "all", label: tr("All") }, { value: "comments", label: tr("Comments"), icon: MessageSquare }, { value: "history", label: tr("History"), icon: History }]} />}
      />
      {comments.error || history.error ? <p className="mb-3 text-sm text-rose-500">{(comments.error || history.error).message}</p> : null}
      <ol className="activity-list space-y-3">
        {items.map((it) =>
          it.kind === "history" ? (
            <li key={it.key} className="activity-history flex items-start gap-2.5 pl-1 text-xs text-fg-muted">
              <span className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface-2 text-fg-faint">{(() => { const Icon = ACTION_ICON[it.action] ?? ArrowRight; return <Icon size={11} />; })()}</span>
              <p className="min-w-0 flex-1 leading-5">{sentence(it, tr)} <span className="whitespace-nowrap text-fg-faint" title={formatDateTime(it.at)}>· {relativeTime(it.at)}</span></p>
            </li>
          ) : (
            <li key={it.key} className="activity-comment flex items-start gap-2.5">
              <Avatar name={it.author_name} color={it.avatar_color} avatar={it.avatar} size="sm" />
              <div className="min-w-0 flex-1 rounded-app border border-line bg-surface-2/40 px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-2 text-xs">
                  <span className="font-semibold text-fg">{it.author_name}</span>
                  <span className="text-fg-faint" title={formatDateTime(it.at)}>{relativeTime(it.at)}</span>
                  {it.edited_at ? <span className="text-fg-faint">· {tr("edited")}</span> : null}
                  <span className="flex-1" />
                  {it.mine && canEdit ? <Button variant="ghost" size="iconXs" icon={Pencil} onClick={() => setEditing({ id: it.id, body: it.body })} aria-label={tr("Edit comment")} data-tip={tr("Edit")} /> : null}
                  {it.can_delete && canEdit ? <Button variant="dangerGhost" size="iconXs" icon={Trash2} onClick={() => setToDelete(it)} aria-label={tr("Delete comment")} data-tip={tr("Delete")} /> : null}
                </div>
                {editing?.id === it.id ? (
                  <div className="mt-2">
                    <BlockEditor value={editing.body} onChange={(v) => setEditing((e) => ({ ...e, body: v }))} onSave={saveEdit} mono={false} placeholder={tr("Write a comment…")} />
                    <div className="mt-2 flex justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>{tr("Cancel")}</Button>
                      <Button size="sm" onClick={saveEdit} loading={busy} disabled={!editing.body.trim()}>{tr("Save")}</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <RenderedText text={displayMentions(it.body)} className="mt-1" />
                    <MentionChips text={it.body} size="xs" className="mt-2" />
                  </>
                )}
              </div>
            </li>
          )
        )}
        {!items.length && !comments.loading && !history.loading ? <li className="py-4 text-center text-sm text-fg-muted">{view === "history" ? tr("No changes recorded yet.") : tr("No comments yet. Start the conversation.")}</li> : null}
      </ol>

      {view !== "history" ? (
        canEdit ? (
          <div className={cn("comment-composer mt-4 border-t border-line pt-4")}>
            <BlockEditor value={draft} onChange={setDraft} onSave={send} mono={false} placeholder={tr("Write a comment… Type @ to tag a person or a record.")} />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-fg-faint">{tr("⌘S sends. Tagged people with a portal account are notified.")}</span>
              <Button size="sm" icon={Send} onClick={send} loading={sending} disabled={!draft.trim()} className="comment-send">{tr("Comment")}</Button>
            </div>
          </div>
        ) : (
          <p className="mt-4 border-t border-line pt-3 text-xs text-fg-muted">{tr("You have view-only access, so you can read the discussion but not join it.")}</p>
        )
      ) : null}

      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={remove} loading={busy} title="Delete this comment?" description={toDelete ? displayMentions(toDelete.body).slice(0, 140) : ""} />
    </Card>
  );
}
