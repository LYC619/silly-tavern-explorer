"use client"

import { ArrowUpRight, WandSparkles } from "lucide-react"
import type { Story, TreeNode } from "@/lib/mock-data"
import { StorySwitcher } from "@/components/story-switcher"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function Node({ node }: { node: TreeNode }) {
  return (
    <li className="relative pl-6 before:absolute before:top-0 before:left-0 before:h-full before:w-px before:bg-border after:absolute after:top-4 after:left-0 after:h-px after:w-4 after:bg-border last:before:h-4">
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border px-3 py-1.5 text-[13px]",
          node.active
            ? "border-primary/40 bg-accent/50 text-foreground"
            : "border-border/70 bg-card text-muted-foreground",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            node.active ? "bg-primary" : "bg-border",
          )}
        />
        <span className="truncate">{node.label}</span>
        {node.note ? (
          <span className="ml-auto shrink-0 rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {node.note}
          </span>
        ) : null}
      </div>
      {node.children?.length ? (
        <ul className="mt-2 flex flex-col gap-2">
          {node.children.map((c) => (
            <Node key={c.id} node={c} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function TreeView({
  stories,
  story,
  onStoryChange,
}: {
  stories: Story[]
  story: Story
  onStoryChange: (id: string) => void
}) {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <StorySwitcher stories={stories} value={story.id} onChange={onStoryChange} />
          <span className="text-[11px] text-muted-foreground">当前故事的分支走向</span>
        </div>
        <Button variant="outline" size="sm" title="跳转到处理区 · 故事树，在那里重建分支结构">
          <WandSparkles className="size-3.5" />
          去处理区生成
          <ArrowUpRight className="size-3.5 opacity-60" />
        </Button>
      </header>

      <div className="rounded-lg border border-border/70 bg-card px-5 py-4">
        <ul className="flex flex-col gap-2">
          {story.tree.map((n) => (
            <Node key={n.id} node={n} />
          ))}
        </ul>
      </div>
    </section>
  )
}
