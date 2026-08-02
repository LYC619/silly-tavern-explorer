import type { StoryStatus } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

const styles: Record<StoryStatus, string> = {
  未开始: "border-border bg-secondary text-muted-foreground",
  进行中: "border-primary/30 bg-primary/12 text-primary",
  已完结: "border-chart-2/40 bg-chart-2/15 text-foreground",
  已搁置: "border-border bg-muted text-muted-foreground",
}

export function StatusChip({ status, className }: { status: StoryStatus; className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-md border px-2 py-0.5 text-[11px] whitespace-nowrap",
        styles[status],
        className,
      )}
    >
      {status}
    </span>
  )
}
