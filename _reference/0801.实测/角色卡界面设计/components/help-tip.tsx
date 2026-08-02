"use client"

import { CircleQuestionMark } from "lucide-react"
import { cn } from "@/lib/utils"

export function HelpTip({ text, className }: { text: string; className?: string }) {
  return (
    <span
      title={text}
      tabIndex={0}
      role="note"
      aria-label={text}
      className={cn(
        "inline-flex cursor-help items-center text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none",
        className,
      )}
    >
      <CircleQuestionMark className="size-3.5" />
    </span>
  )
}
