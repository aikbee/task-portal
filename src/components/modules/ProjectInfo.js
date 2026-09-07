"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, BookOpen, KeyRound, Link2, FileText, Paperclip, Pin } from "lucide-react";
import { useFetch } from "@/lib/hooks";
import { INFO_CATEGORY } from "@/lib/modules";
import { cn, relativeTime } from "@/lib/utils";
import Card, { CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState, Skeleton } from "@/components/ui/Misc";
import InfoForm from "./InfoForm";
import { useT } from "@/lib/i18n";

/** Info items linked to a project. */
export default function ProjectInfo({ project }) {
  const tr = useT();
  const { data, loading, refetch } = useFetch(`/api/info?project_id=${project.id}`);
  const [formOpen, setFormOpen] = useState(false);
  const items = data ?? [];
  return (
    <Card>
      <CardHeader icon={BookOpen} title={tr("Info")} description={`${items.length} item${items.length === 1 ? "" : "s"} linked to this project`} actions={<Button size="sm" icon={Plus} onClick={() => setFormOpen(true)}>{tr("New info")}</Button>} />
      {loading && !data ? <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-14" />)}</div> : null}
      {data && items.length === 0 ? (
        <EmptyState compact icon={BookOpen} title="No info yet" description="Keep guidelines, credentials and links for this project here." action={<Button size="sm" icon={Plus} onClick={() => setFormOpen(true)}>Add the first one</Button>} />
      ) : null}
      <ul className="divide-y divide-line">
        {items.map((i) => (
          <li key={i.id}>
            <Link href={`/info/${i.id}`} className="flex items-center gap-3 rounded-app-sm px-1 py-2.5 hover:bg-surface-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-app-sm text-white" style={{ background: i.color }}><BookOpen size={15} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{i.title}</span>
                  {i.pinned ? <Pin size={11} className="text-accent" /> : null}
                </span>
                <span className="block truncate text-[11px] text-fg-muted">{i.summary || (i.tags ? i.tags.split(",").map((t) => `#${t}`).join(" ") : relativeTime(i.updated_at))}</span>
              </span>
              <StatusBadge map={INFO_CATEGORY} value={i.category} dot={false} />
              <span className="flex items-center gap-2 text-xs text-fg-muted">
                {i.has_secret ? <KeyRound size={13} className="text-amber-500" /> : null}
                {i.url ? <Link2 size={13} /> : null}
                <span className={cn("inline-flex items-center gap-0.5", i.note_count > 0 && "text-fg")}><FileText size={12} />{i.note_count}</span>
                <span className={cn("inline-flex items-center gap-0.5", i.attachment_count > 0 && "text-fg")}><Paperclip size={12} />{i.attachment_count}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <InfoForm open={formOpen} onClose={() => setFormOpen(false)} defaults={{ project_id: project.id }} onSaved={refetch} />
    </Card>
  );
}
