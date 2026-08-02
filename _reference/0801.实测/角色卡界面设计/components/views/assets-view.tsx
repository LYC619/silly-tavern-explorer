"use client"

import { BookOpen, Ellipsis, Quote, Regex, SlidersHorizontal, Upload } from "lucide-react"
import type { Asset, AssetKind } from "@/lib/mock-data"
import { absoluteDate } from "@/lib/time"

const icons: Record<AssetKind, typeof BookOpen> = {
  世界书: BookOpen,
  预设: SlidersHorizontal,
  正则: Regex,
  引用: Quote,
}

export function AssetsView({
  assets,
  onOpen,
  onImport,
}: {
  assets: Asset[]
  onOpen: (id: string) => void
  onImport: () => void
}) {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between gap-4">
        <p className="text-[11px] text-muted-foreground">
          点击名称在右侧查看详情。启用状态与 ST 目录同步。
        </p>
        <button
          type="button"
          onClick={onImport}
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-primary"
        >
          <Upload className="size-3.5" />
          导入资产
        </button>
      </header>

      <ul className="flex flex-col gap-2">
        {assets.map((a) => {
          const Icon = icons[a.kind]
          return (
            <li key={a.id}>
              <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-card px-4 py-3">
                <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.6} />
                <button
                  type="button"
                  onClick={() => onOpen(a.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-[13px] text-foreground hover:text-primary hover:underline">
                    {a.kind}：{a.name}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">{a.meta}</span>
                </button>
                <span className="shrink-0 rounded-md border border-border bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                  {a.kind}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {absoluteDate(a.importedAt)}
                </span>
                <span
                  className={`shrink-0 text-[11px] ${a.enabled ? "text-primary" : "text-muted-foreground"}`}
                >
                  {a.enabled ? "已启用" : "未启用"}
                </span>
                <button
                  type="button"
                  aria-label={`${a.name} 的更多操作`}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Ellipsis className="size-4" />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
