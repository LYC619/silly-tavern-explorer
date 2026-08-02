import { Database } from "lucide-react"
import { stStatus } from "@/lib/mock-data"

export function StatusBar() {
  return (
    <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-border/70 bg-sidebar px-6 py-2.5 text-xs text-muted-foreground">
      <div className="flex min-w-0 items-center gap-2">
        <Database className="size-3.5 shrink-0" strokeWidth={1.6} />
        <span className="shrink-0">
          {stStatus.connected ? "已接入 ST 目录" : "未接入 ST 目录"} ·
        </span>
        <span className="truncate font-mono text-[11px]">{stStatus.path}</span>
      </div>
      <span className="shrink-0">{stStatus.version}</span>
    </footer>
  )
}
