"use client"

import { ArrowUpRight, TriangleAlert, WandSparkles } from "lucide-react"
import type { Story } from "@/lib/mock-data"
import { StorySwitcher } from "@/components/story-switcher"
import { Button } from "@/components/ui/button"
import { absoluteDateTime, relativeTime } from "@/lib/time"

export function DiaryView({
  stories,
  story,
  onStoryChange,
}: {
  stories: Story[]
  story: Story
  onStoryChange: (id: string) => void
}) {
  const empty = story.diary.entries.length === 0

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <StorySwitcher stories={stories} value={story.id} onChange={onStoryChange} />
          <span className="text-[11px] text-muted-foreground">以角色视角回顾这段故事</span>
        </div>
        <Button variant="outline" size="sm" title="跳转到处理区 · 日记，在那里批量生成或重新生成">
          <WandSparkles className="size-3.5" />
          去处理区生成
          <ArrowUpRight className="size-3.5 opacity-60" />
        </Button>
      </header>

      {story.diary.stale ? (
        <p className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-[11px] text-primary">
          <TriangleAlert className="size-3.5 shrink-0" />
          聊天记录已更新，此日记已过期，可重新生成。
        </p>
      ) : null}

      {empty ? (
        <p className="rounded-lg border border-dashed border-border bg-card/60 px-4 py-8 text-center text-[13px] text-muted-foreground">
          这段故事还没有日记。
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {story.diary.entries.map((e, i) => (
            <li
              key={i}
              className="relative rounded-lg border border-border/70 bg-card px-5 py-4 before:absolute before:inset-y-4 before:left-0 before:w-0.5 before:rounded-full before:bg-primary/40"
            >
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <h3 className="font-serif text-[15px] text-foreground">{e.title}</h3>
                <span className="shrink-0 text-[11px] text-muted-foreground">{e.date}</span>
              </div>
              <p className="font-serif text-[14px] leading-relaxed text-foreground/85">{e.body}</p>
            </li>
          ))}
        </ul>
      )}

      {story.diary.generatedAt ? (
        <p
          className="text-[11px] text-muted-foreground"
          title={absoluteDateTime(story.diary.generatedAt)}
        >
          生成于 {relativeTime(story.diary.generatedAt)}
        </p>
      ) : null}
    </section>
  )
}
