"use client"

import { useState } from "react"
import { Check, ChevronDown, Plus, Upload, ZoomIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { absoluteDate } from "@/lib/time"
import { cn } from "@/lib/utils"

export type Portrait = { id: string; src: string; label: string; current: boolean; addedAt: string }
export type PortraitRow = { id: string; title: string; items: Portrait[] }

export function PortraitsView({
  rows,
  onSetCurrent,
  onRenameRow,
  onAddRow,
  onZoom,
  onImport,
}: {
  rows: PortraitRow[]
  onSetCurrent: (id: string) => void
  onRenameRow: (rowId: string, title: string) => void
  onAddRow: () => void
  onZoom: (src: string) => void
  onImport: () => void
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          按行管理立绘：一行可以是一个角色，也可以是剧情的一个阶段。行内左右滚动，或展开成网格。
        </p>
        <button
          type="button"
          onClick={onAddRow}
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-primary"
        >
          <Plus className="size-3.5" />
          新建分行
        </button>
      </div>

      {rows.map((row) => {
        const open = expanded[row.id] ?? false
        return (
          <article
            key={row.id}
            className="flex min-w-0 flex-col gap-2 rounded-lg border border-border/70 bg-card px-4 py-3"
          >
            <header className="flex flex-wrap items-center gap-2">
              <input
                value={row.title}
                onChange={(e) => onRenameRow(row.id, e.target.value)}
                aria-label="分行标题"
                className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 font-serif text-[15px] text-foreground outline-none transition-colors hover:border-border focus-visible:border-ring"
              />
              <span className="shrink-0 text-[11px] text-muted-foreground">{row.items.length} 张</span>
              <button
                type="button"
                onClick={onImport}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Upload className="size-3.5" />
                导入到此行
              </button>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setExpanded((p) => ({ ...p, [row.id]: !open }))}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
                {open ? "收起" : "展开"}
              </button>
            </header>

            <ul
              className={cn(
                open
                  ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
                  : "flex gap-3 overflow-x-auto pb-1.5",
              )}
            >
              {row.items.map((p) => (
                <li
                  key={p.id}
                  className={cn(
                    "flex flex-col overflow-hidden rounded-md border bg-background",
                    open ? "" : "w-[136px] shrink-0",
                    p.current ? "border-primary/50" : "border-border/70",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onZoom(p.src)}
                    className="group relative"
                    aria-label={`放大查看 ${p.label}`}
                  >
                    <img src={p.src || "/placeholder.svg"} alt={p.label} className="aspect-[3/4] w-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center bg-foreground/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <ZoomIn className="size-5 text-background" />
                    </span>
                    {p.current ? (
                      <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                        <Check className="size-3" />
                        当前
                      </span>
                    ) : null}
                  </button>
                  <div className="flex flex-col gap-1.5 px-2 py-2">
                    <span className="truncate text-[12px] text-foreground" title={p.label}>
                      {p.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{absoluteDate(p.addedAt)}</span>
                    <Button
                      variant={p.current ? "ghost" : "outline"}
                      size="xs"
                      disabled={p.current}
                      onClick={() => onSetCurrent(p.id)}
                      className="w-full justify-center"
                    >
                      {p.current ? "正在使用" : "设为卡面"}
                    </Button>
                  </div>
                </li>
              ))}
              <li
                className={cn(
                  "flex items-center justify-center",
                  open ? "min-h-full" : "w-[136px] shrink-0",
                )}
              >
                <button
                  type="button"
                  onClick={onImport}
                  className="flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-8 text-[12px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                  <Plus className="size-4" />
                  添加图片
                </button>
              </li>
            </ul>
          </article>
        )
      })}
    </section>
  )
}
