import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, NotebookText, Wrench } from 'lucide-react';
import { ApiStatusLine } from '@/components/ai-tools/ApiStatusLine';
import { HelpCard } from '@/components/HelpCard';
import { RecordWorkbench, type RecordWorkbenchHandle } from '@/components/organize/RecordWorkbench';
import { MiniSummaryPanel } from '@/components/summary/MiniSummaryPanel';
import { SavedSummaryList } from '@/components/summary/SavedSummaryList';
import { SummaryGallery } from '@/components/summary/SummaryGallery';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getBranchLine } from '@/lib/archive-db';
import { getAllSummaries } from '@/lib/summary-db';
import type { ArchiveStory } from '@/types/archive';
import { SUMMARY_KIND_LABELS, type SummaryItem, type SummaryKind } from '@/types/summary';

interface SummaryWorkspaceProps {
  story: ArchiveStory;
  characterName?: string;
  currentBranchId: string | null;
  kind: SummaryKind;
  initialTarget?: { type: 'record' | 'tree'; id: string };
  /** 兼容旧调用方；二级类型现在由工作区本地持有，不再改路由导致整个页面重挂。 */
  onKindChange?: (kind: SummaryKind) => void;
}

type SummarySurfaceKind = SummaryKind | 'mini';
const KINDS: SummarySurfaceKind[] = ['volume', 'diary', 'diy', 'mini'];

export function SummaryWorkspace({
  story,
  characterName,
  currentBranchId,
  kind,
  initialTarget,
}: SummaryWorkspaceProps) {
  const [view, setView] = useState<'workshop' | 'gallery'>('workshop');
  const [activeKind, setActiveKind] = useState<SummarySurfaceKind>(kind);
  const [selectedRecord, setSelectedRecord] = useState<SummaryItem | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [draftNonce, setDraftNonce] = useState(0);
  const [pendingAction, setPendingAction] = useState<'manual' | 'regenerate' | null>(null);
  const [detailMode, setDetailMode] = useState(false);
  const workbenchRef = useRef<RecordWorkbenchHandle>(null);

  const currentLine = getBranchLine(story, currentBranchId) ?? getBranchLine(story, null)!;

  const loadInitialTarget = useCallback(async () => {
    if (initialTarget?.type !== 'record') return;
    const item = (await getAllSummaries()).find((summary) => summary.id === initialTarget.id && summary.bookId === story.id);
    if (!item) return;
    setSelectedRecord(item);
    setDetailMode(true);
    setActiveKind(item.kind);
  }, [initialTarget, story.id]);

  useEffect(() => { void loadInitialTarget(); }, [loadInitialTarget]);
  useEffect(() => { setActiveKind(kind); }, [kind]);

  useEffect(() => {
    if (!pendingAction) return;
    if (pendingAction === 'manual') workbenchRef.current?.startManual();
    else workbenchRef.current?.regenerate();
    setPendingAction(null);
  }, [activeKind, pendingAction, selectedRecord, draftNonce]);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  const handleSaved = useCallback((item: SummaryItem) => {
    setSelectedRecord(item);
    setDetailMode(true);
    setRefreshKey((value) => value + 1);
  }, []);

  const openRecord = useCallback((item: SummaryItem) => {
    setView('workshop');
    setActiveKind(item.kind);
    setSelectedRecord(item);
    setDetailMode(true);
  }, []);

  const regenerateRecord = useCallback((item: SummaryItem) => {
    setView('workshop');
    setActiveKind(item.kind);
    setSelectedRecord(item);
    setDetailMode(true);
    setPendingAction('regenerate');
  }, []);

  const startManual = () => {
    setView('workshop');
    setSelectedRecord(null);
    setDetailMode(true);
    setDraftNonce((value) => value + 1);
    setPendingAction('manual');
  };

  const changeKind = (next: SummarySurfaceKind) => {
    setSelectedRecord(null);
    setDetailMode(false);
    setDraftNonce((value) => value + 1);
    setActiveKind(next);
  };

  const backToList = () => {
    setSelectedRecord(null);
    setDetailMode(false);
    setDraftNonce((value) => value + 1);
  };

  return (
    <div data-summary-workspace className="h-full min-h-0 overflow-hidden px-4 py-3">
      <div className="mx-auto flex h-full min-h-0 max-w-7xl flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-[color:var(--border-subtle)] pb-3">
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md gold-gradient shadow-card">
              <NotebookText className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="flex items-center gap-1">
              <h1 className="font-display text-lg font-semibold">总结</h1>
              <HelpCard>左侧配置生成范围和挂载，右侧在已生成列表与当前详情之间切换。</HelpCard>
            </div>
          </div>

          <Tabs value={view} onValueChange={(value) => setView(value as 'workshop' | 'gallery')}>
            <TabsList className="flex h-8 w-fit">
              <TabsTrigger value="workshop" className="h-7 gap-1.5 whitespace-nowrap px-3"><Wrench className="h-3.5 w-3.5" />生成工作台</TabsTrigger>
              <TabsTrigger value="gallery" className="h-7 gap-1.5 whitespace-nowrap px-3"><BookOpen className="h-3.5 w-3.5" />展示页</TabsTrigger>
            </TabsList>
          </Tabs>

          <span className="h-6 w-px shrink-0 bg-[color:var(--border-subtle)]" />
          <Tabs value={activeKind} onValueChange={(value) => changeKind(value as SummarySurfaceKind)}>
            <TabsList className="flex h-8 w-fit">
              {KINDS.map((item) => (
                <TabsTrigger key={item} value={item} className="h-7 whitespace-nowrap px-3 text-xs">
                  {item === 'mini' ? '小总结' : SUMMARY_KIND_LABELS[item]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="ml-auto hidden min-w-0 items-center gap-3 xl:flex">
            <div className="max-w-72 truncate text-xs text-muted-foreground" title={story.title}>
              <span className="font-medium text-foreground">{story.title}</span>
              <span> · {currentLine.session.messages.length} 楼</span>
            </div>
            <ApiStatusLine />
          </div>
        </header>

        <div className="mt-3 min-h-0 flex-1">
        {activeKind === 'mini' ? (
          <div className="h-full min-h-0 overflow-y-auto rounded-md border border-[color:var(--border-subtle)] bg-elevated p-4 scrollbar-thin">
            <MiniSummaryPanel session={currentLine.session} />
          </div>
        ) : view === 'gallery' ? (
          <SummaryGallery
            currentBookId={story.id}
            refreshKey={refreshKey}
            kind={activeKind}
            charName={characterName ?? currentLine.session.character?.name}
            onEdit={openRecord}
          />
        ) : (
          <RecordWorkbench
            key={`${activeKind}:${selectedRecord?.id ?? `draft-${draftNonce}`}`}
            ref={workbenchRef}
            story={story}
            kind={activeKind}
            record={selectedRecord?.kind === activeKind ? selectedRecord : null}
            defaultBranchId={currentBranchId}
            onSaved={handleSaved}
            showEmptyEditor={false}
            showApiStatus={false}
            sidePanel={
              detailMode ? (
                <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--border-subtle)] pb-2">
                  <Button variant="ghost" size="sm" className="h-7 gap-1.5" onClick={backToList}>
                    <ArrowLeft className="h-3.5 w-3.5" />返回已生成总结
                  </Button>
                  <span className="text-xs text-muted-foreground">{selectedRecord?.title || '新总结'}</span>
                </div>
              ) : (
              <div className="flex h-full min-h-0 flex-col">
                <SavedSummaryList
                  currentBookId={story.id}
                  refreshKey={refreshKey}
                  kind={activeKind}
                  onAdd={startManual}
                  onView={openRecord}
                  onRegenerate={regenerateRecord}
                  onChanged={refresh}
                />
              </div>
              )
            }
          />
        )}
        </div>
      </div>
    </div>
  );
}
