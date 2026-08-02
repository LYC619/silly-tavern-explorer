"use client"

import { useEffect } from "react"
import { X } from "lucide-react"
import type { Asset } from "@/lib/mock-data"
import { Button } from "@/components/ui/button"
import { absoluteDate } from "@/lib/time"

export function AssetDrawer({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
  useEffect(() => {
    if (!asset) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [asset, onClose])

  return (
    <>
      <div
        aria-hidden={!asset}
        onClick={onClose}
        className={
          asset
            ? "fixed inset-0 z-40 bg-foreground/30 opacity-100 transition-opacity"
            : "pointer-events-none fixed inset-0 z-40 bg-foreground/30 opacity-0 transition-opacity"
        }
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="资产详情"
        aria-hidden={!asset}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card shadow-2xl transition-transform duration-200 ${
          asset ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {asset ? (
          <>
            <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="flex flex-col gap-1">
                <span className="inline-flex w-fit items-center rounded-md bg-accent px-1.5 py-0.5 text-[10px] text-accent-foreground">
                  {asset.kind}
                </span>
                <h2 className="font-serif text-base leading-snug text-foreground">{asset.name}</h2>
                <p className="text-[11px] text-muted-foreground">
                  {asset.meta} · 导入于 {absoluteDate(asset.importedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭详情"
                className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <ul className="flex flex-col gap-3">
                {asset.entries.map((entry, i) => (
                  <li key={i} className="flex flex-col gap-1.5 rounded-lg border border-border/70 bg-background/60 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] text-foreground">{entry.title}</span>
                      {entry.keys ? (
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {entry.keys}
                        </code>
                      ) : null}
                    </div>
                    <p className="text-[13px] leading-relaxed text-muted-foreground">{entry.body}</p>
                  </li>
                ))}
              </ul>
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
              <span className="text-[11px] text-muted-foreground">
                {asset.enabled ? "已启用，参与本角色的对话构建" : "未启用"}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">
                  在 ST 中打开
                </Button>
                <Button variant="ghost" size="sm" onClick={onClose}>
                  收起
                </Button>
              </div>
            </footer>
          </>
        ) : null}
      </aside>
    </>
  )
}
