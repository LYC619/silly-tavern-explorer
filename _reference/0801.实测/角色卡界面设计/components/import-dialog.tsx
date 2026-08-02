"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { BookOpen, FileText, ImageUp, Quote, Regex, SlidersHorizontal, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type ImportKind = "story" | "worldbook" | "preset" | "regex" | "quote" | "portrait"

const KINDS: {
  id: ImportKind
  label: string
  ext: string
  hint: string
  icon: React.ComponentType<{ className?: string }>
}[] = [
  { id: "story", label: "故事记录", ext: ".jsonl", hint: "SillyTavern 聊天记录，导入后成为新故事", icon: FileText },
  { id: "worldbook", label: "世界书", ext: ".json", hint: "Lorebook / World Info 条目集合", icon: BookOpen },
  { id: "preset", label: "预设", ext: ".json", hint: "采样参数与提示词预设", icon: SlidersHorizontal },
  { id: "regex", label: "正则", ext: ".json", hint: "显示层与请求层的替换规则", icon: Regex },
  { id: "quote", label: "引用", ext: ".json / .txt", hint: "摘录、引用片段集合", icon: Quote },
  { id: "portrait", label: "立绘", ext: ".png / .jpg / .webp", hint: "备用卡面，可随时切换为当前卡面", icon: ImageUp },
]

export function ImportDialog({
  open,
  defaultKind,
  onClose,
}: {
  open: boolean
  defaultKind: ImportKind
  onClose: () => void
}) {
  const [kind, setKind] = useState<ImportKind>(defaultKind)
  const [fileName, setFileName] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (open) {
      setKind(defaultKind)
      setFileName(null)
      setDragging(false)
    }
  }, [open, defaultKind])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  const active = KINDS.find((k) => k.id === kind) ?? KINDS[0]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="导入资源"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-lg flex-col gap-4 rounded-xl border border-border bg-popover p-5 shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="font-serif text-lg leading-tight text-foreground">导入</h2>
            <p className="text-[11px] text-muted-foreground">从本地文件导入故事、世界书、预设等资源</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => {
            const Icon = k.icon
            const on = k.id === kind
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                aria-pressed={on}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                  on
                    ? "border-primary/50 bg-accent text-accent-foreground"
                    : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {k.label}
              </button>
            )
          })}
        </div>

        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const f = e.dataTransfer.files?.[0]
            if (f) setFileName(f.name)
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors",
            dragging ? "border-primary bg-accent/60" : "border-border bg-muted/40 hover:border-primary/40",
          )}
        >
          <Upload className="size-5 text-muted-foreground" />
          <span className="text-[13px] text-foreground">
            {fileName ?? `拖入文件，或点击选择 ${active.label}`}
          </span>
          <span className="text-[11px] text-muted-foreground">
            支持 {active.ext} · {active.hint}
          </span>
          <input
            type="file"
            className="sr-only"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
        </label>

        <footer className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">导入的资源会自动关联到当前角色卡。</p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              取消
            </Button>
            <Button size="sm" disabled={!fileName} onClick={onClose}>
              开始导入
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}
