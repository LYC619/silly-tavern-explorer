"use client"

import { useMemo, useState } from "react"
import { Plus, X } from "lucide-react"
import { HelpTip } from "@/components/help-tip"
import { character } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

type Tag = { id: string; label: string; group: string; builtin: boolean }

const NSFW_HINT =
  "标记该卡为 NSFW 卡面。开启后可在「设置 · 显示」中对 NSFW 卡面的卡图做模糊处理（默认开启模糊）。"

export function TagBar() {
  const [tags, setTags] = useState<Tag[]>(character.tags)
  const [nsfw, setNsfw] = useState(character.nsfw)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState("")

  // 内置分属在前、自定义分属在后，同一分属内保持导入顺序
  const groups = useMemo(() => {
    const map = new Map<string, Tag[]>()
    for (const t of [...tags].sort((a, b) => Number(a.builtin === false) - Number(b.builtin === false))) {
      const list = map.get(t.group) ?? []
      list.push(t)
      map.set(t.group, list)
    }
    return [...map.entries()]
  }, [tags])

  function addTag() {
    const label = draft.trim()
    if (label) {
      setTags((prev) => [...prev, { id: `t-${Date.now()}`, label, group: "我的标签", builtin: false }])
    }
    setDraft("")
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
        <span className={cn("transition-colors", nsfw && "text-destructive")}>NSFW</span>
        <span className="sr-only">切换 NSFW 卡面标记</span>
        <input type="checkbox" checked={nsfw} onChange={(e) => setNsfw(e.target.checked)} className="peer sr-only" />
        <span
          aria-hidden="true"
          className={cn(
            "relative h-4 w-7 rounded-full transition-colors peer-focus-visible:ring-3 peer-focus-visible:ring-ring/40",
            nsfw ? "bg-destructive" : "bg-border",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-3 rounded-full bg-card shadow-sm transition-all",
              nsfw ? "left-3.5" : "left-0.5",
            )}
          />
        </span>
      </label>
      <HelpTip text={NSFW_HINT} className="-ml-2 shrink-0" />

      <span aria-hidden="true" className="h-4 w-px bg-border" />

      {groups.map(([group, list]) => (
        <div key={group} className="flex items-center gap-1.5">
          <span className="shrink-0 text-[11px] text-muted-foreground/70">{group}</span>
          <ul className="flex flex-wrap gap-1.5">
            {list.map((t) => (
              <li key={t.id}>
                <span
                  className={cn(
                    "group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                    t.builtin
                      ? "border-border bg-secondary text-secondary-foreground"
                      : "border-primary/30 bg-primary/10 text-accent-foreground",
                  )}
                >
                  {t.label}
                  <button
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((x) => x.id !== t.id))}
                    className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                    aria-label={`移除标签 ${t.label}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            addTag()
            setAdding(false)
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === "Enter") addTag()
            if (e.key === "Escape") {
              setDraft("")
              setAdding(false)
            }
          }}
          placeholder="标签名"
          className="h-[22px] w-24 rounded-full border border-input bg-background px-2 text-[11px] outline-none focus-visible:border-ring"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <Plus className="size-3" />
          添加标签
        </button>
      )}
    </div>
  )
}
