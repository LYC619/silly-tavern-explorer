"use client"

import { BookOpenText, Download, FileText, Star, WandSparkles } from "lucide-react"
import type { Story } from "@/lib/mock-data"
import { formatNumber, relativeTime } from "@/lib/time"
import { StatusChip } from "@/components/status-chip"

export function StoryList({
  stories,
  activeId,
  onOpen,
  onProcess,
}: {
  stories: Story[]
  activeId: string
  onOpen: (id: string) => void
  onProcess: (id: string) => void
}) {
  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">共 {stories.length} 段故事 · 点击条目或「阅读」进入正文</p>

      <ul className="flex flex-col gap-2">
        {stories.map((s) => (
          <li key={s.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onOpen(s.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onOpen(s.id)
                }
              }}
              aria-current={s.id === activeId ? "true" : undefined}
              className={`group flex cursor-pointer flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-colors focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none ${
                s.id === activeId
                  ? "border-primary/40 bg-accent/40"
                  : "border-border/70 hover:border-primary/30 hover:bg-accent/25"
              }`}
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.6} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="truncate text-sm text-foreground">
                  {s.name}
                  <span className="text-muted-foreground">
                    {" · "}
                    {s.chatCount} 段聊天 · {relativeTime(s.updatedAt)}
                  </span>
                </p>
                <p className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Star className="size-3" strokeWidth={1.6} />
                    {s.rating === null ? "未评分" : `${s.rating.toFixed(1)}/10`}
                  </span>
                  <span>{formatNumber(s.wordCount)} 字</span>
                </p>
              </div>
              <StatusChip status={s.status} />
              <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <RowAction icon={BookOpenText} label="阅读" title={`阅读 ${s.name}`} onClick={() => onOpen(s.id)} />
                <RowAction
                  icon={WandSparkles}
                  label="处理"
                  title={`在处理区处理 ${s.name}（生成总结、日记、故事树）`}
                  onClick={() => onProcess(s.id)}
                />
                <RowAction icon={Download} label="导出" title={`导出 ${s.name}`} onClick={() => {}} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function RowAction({
  icon: Icon,
  label,
  title,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  )
}
