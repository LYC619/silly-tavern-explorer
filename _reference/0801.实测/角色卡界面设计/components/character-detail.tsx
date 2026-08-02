"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight, PenLine, Upload } from "lucide-react"
import { InfoPanel } from "@/components/info-panel"
import { ActionPanel } from "@/components/action-panel"
import { MetaEditor, type CardMeta } from "@/components/meta-editor"
import { AssetDrawer } from "@/components/asset-drawer"
import { ImportDialog, type ImportKind } from "@/components/import-dialog"
import { Lightbox } from "@/components/lightbox"
import { TagBar } from "@/components/tag-bar"
import { StoryList } from "@/components/views/story-list"
import { StoryReader } from "@/components/views/story-reader"
import { SummaryView } from "@/components/views/summary-view"
import { DiaryView } from "@/components/views/diary-view"
import { TreeView } from "@/components/views/tree-view"
import { AssetsView } from "@/components/views/assets-view"
import { NotesView } from "@/components/views/notes-view"
import { PortraitsView, type PortraitRow } from "@/components/views/portraits-view"
import { Button } from "@/components/ui/button"
import { assets, character, stories } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

type Tab = "story" | "summary" | "diary" | "tree" | "notes" | "assets" | "portraits"

const SUB_TABS: { id: Tab; label: string }[] = [
  { id: "summary", label: "总结" },
  { id: "diary", label: "日记" },
  { id: "tree", label: "故事树" },
]

export function CharacterDetail() {
  const [tab, setTab] = useState<Tab>("story")
  const [storyId, setStoryId] = useState(stories[0].id)
  const [readerOpen, setReaderOpen] = useState(false)
  const [headerOpen, setHeaderOpen] = useState(true)
  const [subOpen, setSubOpen] = useState(false)
  const [rows, setRows] = useState<PortraitRow[]>(character.portraitRows)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [assetId, setAssetId] = useState<string | null>(null)
  const [importKind, setImportKind] = useState<ImportKind | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [metaOpen, setMetaOpen] = useState(false)
  const [meta, setMeta] = useState<CardMeta>({
    name: character.name,
    creator: character.creator,
    source: character.source,
    intro: character.intro,
  })

  const story = useMemo(() => stories.find((s) => s.id === storyId) ?? stories[0], [storyId])
  const asset = useMemo(() => assets.find((a) => a.id === assetId) ?? null, [assetId])
  const allPortraits = rows.flatMap((r) => r.items)
  const currentPortrait = allPortraits.find((p) => p.current) ?? allPortraits[0]
  const portraitCount = allPortraits.length

  function openStory(id: string) {
    setStoryId(id)
    setReaderOpen(true)
    setHeaderOpen(false)
  }

  function closeReader() {
    setReaderOpen(false)
    setHeaderOpen(true)
  }

  function setCurrentPortrait(id: string) {
    setRows((prev) => prev.map((r) => ({ ...r, items: r.items.map((p) => ({ ...p, current: p.id === id })) })))
  }

  function selectTab(next: Tab) {
    setTab(next)
    if (next === "story") closeReader()
    if (SUB_TABS.some((s) => s.id === next)) setSubOpen(true)
  }

  function handleCardAction(id: string) {
    if (id === "edit") {
      setMetaOpen(true)
      return
    }
    if (id === "read-builtin") {
      setTab("assets")
      setImportKind("worldbook")
      return
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      <InfoPanel
        portraitSrc={currentPortrait.src}
        onZoom={() => setLightbox(currentPortrait.src)}
        onOpenActions={() => setActionsOpen(true)}
      />

      <main className="flex min-w-0 flex-1 flex-col gap-4 px-5 py-5 lg:overflow-y-auto lg:px-6 lg:py-6">
        <header className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <h1
              className={cn(
                "min-w-0 flex-1 font-serif tracking-tight text-foreground text-balance",
                headerOpen ? "text-3xl leading-snug md:text-4xl" : "truncate text-xl leading-tight md:text-2xl",
              )}
            >
              {meta.name}
            </h1>
            <div className="mt-1 flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => setMetaOpen(true)}
                aria-label="编辑展示名称、作者与简介"
                title="编辑展示名称、作者与简介"
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <PenLine className="size-4" />
              </button>
              <button
                type="button"
                aria-expanded={headerOpen}
                onClick={() => setHeaderOpen((v) => !v)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronDown className={cn("size-4 transition-transform", !headerOpen && "-rotate-90")} />
                {headerOpen ? "折叠简介" : "展开简介"}
              </button>
            </div>
          </div>

          {headerOpen ? (
            <>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span>{meta.creator}</span>
                <span aria-hidden="true">·</span>
                <span>{meta.source}</span>
              </p>
              <p className="max-w-3xl text-[15px] leading-relaxed text-foreground/80 text-pretty">{meta.intro}</p>
            </>
          ) : null}

          <TagBar />
        </header>

        <nav
          aria-label="角色卡视图"
          className="flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-border pb-2"
        >
          <TabButton label="故事" badge={stories.length} on={tab === "story"} onClick={() => selectTab("story")} />
          <button
            type="button"
            aria-expanded={subOpen}
            aria-label={subOpen ? "折叠故事的衍生视图" : "展开故事的衍生视图"}
            onClick={() => setSubOpen((v) => !v)}
            className={cn(
              "inline-flex items-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              subOpen && "text-foreground",
            )}
          >
            <ChevronRight className={cn("size-4 transition-transform", subOpen && "rotate-90")} />
          </button>

          {subOpen
            ? SUB_TABS.map((s) => (
                <TabButton key={s.id} label={s.label} on={tab === s.id} onClick={() => selectTab(s.id)} />
              ))
            : null}

          <span aria-hidden="true" className="mx-2 h-4 w-px bg-border" />

          <TabButton
            label="备注"
            badge={character.notes.length}
            on={tab === "notes"}
            onClick={() => selectTab("notes")}
          />
          <TabButton
            label="关联资产"
            badge={assets.length}
            on={tab === "assets"}
            onClick={() => selectTab("assets")}
          />
          <TabButton
            label="立绘"
            badge={portraitCount}
            on={tab === "portraits"}
            onClick={() => selectTab("portraits")}
          />

          <Button variant="outline" size="sm" className="ml-auto" onClick={() => setImportKind("story")}>
            <Upload className="size-3.5" />
            导入
          </Button>
        </nav>

        <div className="min-w-0 pb-4">
          {tab === "story" ? (
            readerOpen ? (
              <StoryReader story={story} onBack={closeReader} />
            ) : (
              <StoryList
                stories={stories}
                activeId={storyId}
                onOpen={openStory}
                onProcess={(id) => {
                  setStoryId(id)
                  setSubOpen(true)
                  setTab("summary")
                }}
              />
            )
          ) : null}

          {tab === "summary" ? <SummaryView stories={stories} story={story} onStoryChange={setStoryId} /> : null}
          {tab === "diary" ? <DiaryView stories={stories} story={story} onStoryChange={setStoryId} /> : null}
          {tab === "tree" ? <TreeView stories={stories} story={story} onStoryChange={setStoryId} /> : null}

          {tab === "notes" ? <NotesView /> : null}
          {tab === "assets" ? (
            <AssetsView assets={assets} onOpen={setAssetId} onImport={() => setImportKind("worldbook")} />
          ) : null}
          {tab === "portraits" ? (
            <PortraitsView
              rows={rows}
              onSetCurrent={setCurrentPortrait}
              onRenameRow={(rowId, title) =>
                setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, title } : r)))
              }
              onAddRow={() =>
                setRows((prev) => [...prev, { id: `r-${Date.now()}`, title: "新的分行", items: [] }])
              }
              onZoom={(src) => setLightbox(src)}
              onImport={() => setImportKind("portrait")}
            />
          ) : null}
        </div>
      </main>

      <ActionPanel
        open={actionsOpen}
        cardName={meta.name}
        onAction={handleCardAction}
        onClose={() => setActionsOpen(false)}
      />
      <MetaEditor
        open={metaOpen}
        value={meta}
        onSave={(next) => {
          setMeta(next)
          setMetaOpen(false)
        }}
        onClose={() => setMetaOpen(false)}
      />
      <Lightbox src={lightbox} alt={`${meta.name} 立绘`} onClose={() => setLightbox(null)} />
      <AssetDrawer asset={asset} onClose={() => setAssetId(null)} />
      <ImportDialog open={importKind !== null} defaultKind={importKind ?? "story"} onClose={() => setImportKind(null)} />
    </div>
  )
}

function TabButton({
  label,
  badge,
  on,
  onClick,
}: {
  label: string
  badge?: number
  on: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-current={on ? "page" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[15px] transition-colors",
        on ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
      {badge ? (
        <span
          className={cn(
            "rounded px-1 py-px font-mono text-[10px]",
            on ? "bg-primary/15 text-accent-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {badge}
        </span>
      ) : null}
    </button>
  )
}
