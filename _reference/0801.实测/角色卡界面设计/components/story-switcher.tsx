"use client"

import { ChevronDown } from "lucide-react"
import type { Story } from "@/lib/mock-data"

export function StorySwitcher({
  stories,
  value,
  onChange,
}: {
  stories: Story[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">选择故事</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 appearance-none rounded-md border border-border bg-card pr-7 pl-2.5 text-xs text-foreground outline-none transition-colors hover:border-primary/40 focus-visible:border-ring"
      >
        {stories.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2 size-3.5 text-muted-foreground"
        aria-hidden="true"
      />
    </label>
  )
}
