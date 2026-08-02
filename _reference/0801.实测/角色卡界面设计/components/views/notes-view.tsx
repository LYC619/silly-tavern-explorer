"use client"

import { useState } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { character } from "@/lib/mock-data"
import { NOW, absoluteDateTime, relativeTime } from "@/lib/time"

export function NotesView() {
  const [notes, setNotes] = useState(character.notes)
  const [draft, setDraft] = useState("")

  function add() {
    const body = draft.trim()
    if (!body) return
    setNotes((prev) => [{ id: `n-${Date.now()}`, at: new Date(NOW).toISOString(), body }, ...prev])
    setDraft("")
  }

  return (
    <section className="flex flex-col gap-3">
      <p className="text-[11px] text-muted-foreground">
        记录这张卡的游玩注意事项：开局技巧、参数坑点、需要手动开关的资产等。
      </p>

      <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-card px-4 py-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="写下一条备注…"
          className="w-full resize-none bg-transparent text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
        />
        <div className="flex justify-end">
          <Button size="sm" disabled={!draft.trim()} onClick={add}>
            添加备注
          </Button>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {notes.map((n) => (
          <li
            key={n.id}
            className="group flex items-start gap-3 rounded-lg border border-border/70 bg-card px-4 py-3"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-[13px] leading-relaxed text-foreground/90">{n.body}</p>
              <span className="text-[11px] text-muted-foreground" title={absoluteDateTime(n.at)}>
                {relativeTime(n.at)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setNotes((prev) => prev.filter((x) => x.id !== n.id))}
              aria-label="删除备注"
              className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
