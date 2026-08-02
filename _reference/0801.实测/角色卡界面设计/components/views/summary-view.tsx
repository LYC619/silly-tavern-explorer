"use client"

import { ArrowUpRight, TriangleAlert, WandSparkles } from "lucide-react"
import type { Story } from "@/lib/mock-data"
import { stStatus } from "@/lib/mock-data"
import { StorySwitcher } from "@/components/story-switcher"
import { Button } from "@/components/ui/button"
import { absoluteDateTime, relativeTime } from "@/lib/time"

export function SummaryView({
  stories,
  story,
  onStoryChange,
}: {
  stories: Story[]
  story: Story
  onStoryChange: (id: string) => void
}) {
  const aiDisabled = !stStatus.aiConfigured
  const empty = story.summary.paragraphs.length === 0

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <StorySwitcher stories={stories} value={story.id} onChange={onStoryChange} />
          <span className="text-[11px] text-muted-foreground">
            总结属于该故事，切换故事后日记与故事树同步跟随
          </span>
        </div>
        <Button variant="outline" size="sm" title="跳转到处理区 · 总结，在那里批量生成或重新生成">
          <WandSparkles className="size-3.5" />
          去处理区生成
          <ArrowUpRight className="size-3.5 opacity-60" />
        </Button>
      </header>

      {aiDisabled ? (
        <p className="rounded-md border border-dashed border-border bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
          未配置 AI API，生成类功能暂不可用。前往 设置 · 接口 填写后即可使用。
        </p>
      ) : null}

      {story.summary.stale ? (
        <p className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-[11px] text-primary">
          <TriangleAlert className="size-3.5 shrink-0" />
          聊天记录已更新，此总结已过期，可重新生成。
        </p>
      ) : null}

      {empty ? (
        <p className="rounded-lg border border-dashed border-border bg-card/60 px-4 py-8 text-center text-[13px] text-muted-foreground">
          这段故事还没有总结。
        </p>
      ) : (
        <article className="flex flex-col gap-3 rounded-lg border border-border/70 bg-card px-5 py-4">
          {story.summary.paragraphs.map((p, i) => (
            <p key={i} className="font-serif text-[14px] leading-relaxed text-foreground/90">
              {p}
            </p>
          ))}
          {story.summary.generatedAt ? (
            <p
              className="mt-1 text-[11px] text-muted-foreground"
              title={absoluteDateTime(story.summary.generatedAt)}
            >
              生成于 {relativeTime(story.summary.generatedAt)}
            </p>
          ) : null}
        </article>
      )}
    </section>
  )
}
