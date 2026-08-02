"use client"

import { useEffect } from "react"
import { Download, FolderInput, PenLine, Trash2, X } from "lucide-react"
import { HelpTip } from "@/components/help-tip"
import { cn } from "@/lib/utils"

type Action = {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  hint?: string
  danger?: boolean
}

export const CARD_ACTIONS: Action[] = [
  { id: "edit", label: "编辑角色卡", icon: PenLine },
  {
    id: "read-builtin",
    label: "读取内置资源",
    icon: FolderInput,
    hint: "读取角色卡文件里自带的世界书、预设、正则等内容，导入后会出现在「关联资产」中。",
  },
  { id: "export", label: "导出角色卡", icon: Download },
  { id: "delete", label: "删除角色卡", icon: Trash2, danger: true },
]

export function ActionPanel({
  open,
  cardName,
  onAction,
  onClose,
}: {
  open: boolean
  cardName: string
  onAction: (id: string) => void
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="关闭角色卡操作"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/45 backdrop-blur-[1px]"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="角色卡操作"
        className="relative flex h-full w-[min(320px,86vw)] flex-col gap-4 border-l border-border bg-popover px-5 py-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="font-serif text-lg leading-tight text-foreground">角色卡操作</h2>
            <p className="truncate text-xs text-muted-foreground" title={cardName}>
              {cardName}
            </p>
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

        <div className="flex flex-col gap-1 border-t border-border/70 pt-3">
          {CARD_ACTIONS.map((a) => {
            const Icon = a.icon
            return (
              <div
                key={a.id}
                className={cn(
                  "flex items-center gap-1 rounded-md pr-2 transition-colors",
                  a.danger ? "hover:bg-destructive/10" : "hover:bg-muted",
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onAction(a.id)
                  }}
                  className={cn(
                    "flex flex-1 items-center gap-2.5 rounded-md px-2.5 py-2.5 text-left text-sm",
                    a.danger ? "text-destructive" : "text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0 opacity-70" />
                  <span className="truncate">{a.label}</span>
                </button>
                {a.hint ? <HelpTip text={a.hint} className="shrink-0" /> : null}
              </div>
            )
          })}
        </div>
      </aside>
    </div>
  )
}
