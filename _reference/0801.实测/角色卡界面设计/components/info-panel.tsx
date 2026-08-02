"use client"

import { ChevronRight, Expand } from "lucide-react"
import { character } from "@/lib/mock-data"
import { absoluteDateTime, formatDuration, formatNumber } from "@/lib/time"

export function InfoPanel({
  portraitSrc,
  onZoom,
  onOpenActions,
}: {
  portraitSrc: string
  onZoom: () => void
  onOpenActions: () => void
}) {
  const fields: { label: string; value: string; hint?: string }[] = [
    { label: "名称", value: character.name },
    { label: "类型", value: character.type },
    { label: "评分", value: character.rating.toFixed(1) },
    { label: "最后游玩", value: absoluteDateTime(character.lastPlayedAt) },
    { label: "字数", value: formatNumber(character.wordCount) },
    {
      label: "游玩时长",
      value: `约 ${formatDuration(character.playMinutes)}`,
      hint: "估算：按相邻消息间隔累加，间隔超过 30 分钟不计入",
    },
  ]

  return (
    <aside className="flex w-full shrink-0 gap-4 border-b border-border/70 bg-card/60 px-5 py-5 lg:w-[272px] lg:flex-col lg:border-r lg:border-b-0 lg:py-6">
      <button
        type="button"
        onClick={onZoom}
        className="group relative h-fit w-[132px] shrink-0 overflow-hidden rounded-md border border-border/80 bg-muted focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none lg:w-full"
        aria-label="放大查看角色立绘"
      >
        <img
          src={portraitSrc || "/placeholder.svg"}
          alt={`${character.name} 的角色立绘`}
          className="aspect-[3/4] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-foreground/55 py-1.5 text-[11px] text-background opacity-0 transition-opacity group-hover:opacity-100">
          <Expand className="size-3" />
          点击放大欣赏
        </span>
      </button>

      <dl className="flex min-w-0 flex-1 flex-col lg:flex-none">
        {fields.map((f) => (
          <div
            key={f.label}
            className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 last:border-b-0"
            title={f.hint ?? f.value}
          >
            <dt className="shrink-0 text-xs text-muted-foreground">{f.label}</dt>
            <dd className="truncate text-right text-[13px] text-foreground">{f.value}</dd>
          </div>
        ))}

        <div className="border-t border-border/60 pt-2">
          <button
            type="button"
            onClick={onOpenActions}
            className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted"
          >
            <span className="text-xs text-muted-foreground">操作</span>
            <span className="flex items-center gap-1 text-[13px] text-foreground">
              展开
              <ChevronRight className="size-3.5" />
            </span>
          </button>
        </div>
      </dl>
    </aside>
  )
}
