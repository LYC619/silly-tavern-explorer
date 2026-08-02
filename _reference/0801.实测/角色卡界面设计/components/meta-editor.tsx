"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

export type CardMeta = {
  name: string
  creator: string
  source: string
  intro: string
}

export function MetaEditor({
  open,
  value,
  onSave,
  onClose,
}: {
  open: boolean
  value: CardMeta
  onSave: (next: CardMeta) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<CardMeta>(value)

  useEffect(() => {
    if (open) setDraft(value)
  }, [open, value])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  const field =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/35"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="关闭编辑"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/45 backdrop-blur-[1px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="编辑展示信息"
        className="relative flex w-full max-w-lg flex-col gap-4 rounded-xl border border-border bg-popover px-5 py-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-serif text-lg leading-tight text-foreground">编辑展示信息</h2>
            <p className="text-xs text-muted-foreground">只改本地展示内容，不写回角色卡原件</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="-mt-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">展示名称</span>
            <input
              className={field}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>

          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">作者</span>
              <input
                className={field}
                value={draft.creator}
                onChange={(e) => setDraft({ ...draft, creator: e.target.value })}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">来源</span>
              <input
                className={field}
                value={draft.source}
                onChange={(e) => setDraft({ ...draft, source: e.target.value })}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">简介</span>
            <textarea
              rows={5}
              className={`${field} resize-y leading-relaxed`}
              value={draft.intro}
              onChange={(e) => setDraft({ ...draft, intro: e.target.value })}
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/70 pt-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button size="sm" onClick={() => onSave(draft)}>
            保存
          </Button>
        </div>
      </div>
    </div>
  )
}
