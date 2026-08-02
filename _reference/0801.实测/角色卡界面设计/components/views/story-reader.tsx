"use client"

import { ArrowLeft, ChevronLeft, ChevronRight, GitBranch, PenLine, Star } from "lucide-react"
import type { Story } from "@/lib/mock-data"
import { StatusChip } from "@/components/status-chip"
import { Button } from "@/components/ui/button"
import { absoluteDateTime, formatNumber, relativeTime } from "@/lib/time"

export function StoryReader({ story, onBack }: { story: Story; onBack: () => void }) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="size-3.5" />
          返回故事列表
        </button>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="font-serif text-xl text-foreground">{story.name}</h2>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{story.chatCount} 段聊天</span>
              <span>{formatNumber(story.wordCount)} 字</span>
              <span className="inline-flex items-center gap-1">
                <Star className="size-3" strokeWidth={1.6} />
                {story.rating === null ? "未评分" : `${story.rating.toFixed(1)}/10`}
              </span>
              <span title={absoluteDateTime(story.updatedAt)}>
                更新于 {relativeTime(story.updatedAt)}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusChip status={story.status} />
            <Button variant="outline" size="sm">
              <PenLine className="size-3.5" />
              在编辑器中打开
            </Button>
          </div>
        </div>
        <p className="rounded-md bg-muted/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          阅读视图用于快速查看与回忆剧情，内容只读。逐条编辑、重roll 与导出片段请在独立编辑界面中进行。
        </p>
      </header>

      <ol className="flex flex-col gap-3">
        {story.messages.map((m) => (
          <li
            key={m.id}
            className={`rounded-lg border px-4 py-3 ${
              m.role === "user"
                ? "border-border/60 bg-secondary/50"
                : "border-border/70 bg-card"
            }`}
          >
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span
                className={`text-[11px] ${
                  m.role === "user" ? "text-muted-foreground" : "font-medium text-primary"
                }`}
              >
                {m.name}
              </span>
              <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
                {m.swipes && m.swipes > 1 ? (
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="上一个分支"
                      className="rounded p-0.5 hover:bg-muted hover:text-foreground"
                    >
                      <ChevronLeft className="size-3" />
                    </button>
                    <span className="inline-flex items-center gap-1">
                      <GitBranch className="size-3" />
                      1/{m.swipes}
                    </span>
                    <button
                      type="button"
                      aria-label="下一个分支"
                      className="rounded p-0.5 hover:bg-muted hover:text-foreground"
                    >
                      <ChevronRight className="size-3" />
                    </button>
                  </span>
                ) : null}
                <span title={absoluteDateTime(m.at)}>{relativeTime(m.at)}</span>
              </span>
            </div>
            <p className="font-serif text-[14px] leading-relaxed text-foreground/90">{m.text}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
