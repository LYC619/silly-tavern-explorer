import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, NotebookText, Wrench } from 'lucide-react';
import { HelpCard } from '@/components/HelpCard';
import { RecordWorkbench, type RecordWorkbenchHandle } from '@/components/organize/RecordWorkbench';
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
  onKindChange: (kind: SummaryKind) => void;
}

const KINDS: SummaryKind[] = ['volume', 'diary', 'diy'];

export function SummaryWorkspace({
  story,
  characterName,
  currentBranchId,
  kind,
  initialTarget,
  onKindChange,
}: SummaryWorkspaceProps) {
  const [view, setView] = useState<'workshop' | 'gallery'>('workshop');
  const [selectedRecord, setSelectedRecord] = useState<SummaryItem | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [draftNonce, setDraftNonce] = useState(0);
  const [pendingAction, setPendingAction] = useState<'manual' | 'regenerate' | null>(null);
  const workbenchRef = useRef<RecordWorkbenchHandle>(null);

  const currentLine = getBranchLine(story, currentBranchId) ?? getBranchLine(story, null)!;

  const loadInitialTarget = useCallback(async () => {
    if (initialTarget?.type !== 'record') return;
    const item = (await getAllSummaries()).find((summary) => summary.id === initialTarget.id && summary.bookId === story.id);
    if (!item) return;
    setSelectedRecord(item);
    onKindChange(item.kind);
  }, [initialTarget, onKindChange, story.id]);

  useEffect(() => { void loadInitialTarget(); }, [loadInitialTarget]);

  useEffect(() => {
    if (!pendingAction) return;
    if (pendingAction === 'manual') workbenchRef.current?.startManual();
    else workbenchRef.current?.regenerate();
    setPendingAction(null);
  }, [kind, pendingAction, selectedRecord, draftNonce]);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  const handleSaved = useCallback((item: SummaryItem) => {
    setSelectedRecord(item);
    setRefreshKey((value) => value + 1);
  }, []);

  const openRecord = useCallback((item: SummaryItem) => {
    setView('workshop');
    setSelectedRecord(item);
    onKindChange(item.kind);
  }, [onKindChange]);

  const regenerateRecord = useCallback((item: SummaryItem) => {
    setView('workshop');
    setSelectedRecord(item);
    onKindChange(item.kind);
    setPendingAction('regenerate');
  }, [onKindChange]);

  const startManual = () => {
    setView('workshop');
    setSelectedRecord(null);
    setDraftNonce((value) => value + 1);
    setPendingAction('manual');
  };

  const changeKind = (next: SummaryKind) => {
    setSelectedRecord(null);
    setDraftNonce((value) => value + 1);
    onKindChange(next);
  };

  return (
    <div className="container mx-auto px-4 py-5">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg gold-gradient flex items-center justify-center shadow-card">
              <NotebookText className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <h1 className="font-display text-xl font-semibold">总结</h1>
                <HelpCard>左侧选择楼层、挂载和模板后生成；右侧管理已存总结，查看后才在列表下方展开编辑。</HelpCard>
              </div>
              <p className="text-xs text-muted-foreground">把聊天记录沉淀为可归档的总结</p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground text-right pt-1">
            <span className="font-medium text-foreground">{story.title}</span>
            <span> · {currentLine.session.messages.length} 楼</span>
          </div>
        </div>

        <Tabs value={view} onValueChange={(value) => setView(value as 'workshop' | 'gallery')}>
          <TabsList className="flex w-fit">
            <TabsTrigger value="workshop" className="gap-1.5 whitespace-nowrap"><Wrench className="w-3.5 h-3.5" />生成工作台</TabsTrigger>
            <TabsTrigger value="gallery" className="gap-1.5 whitespace-nowrap"><BookOpen className="w-3.5 h-3.5" />展示页</TabsTrigger>
          </TabsList>
        </Tabs>

        {view === 'gallery' ? (
          <SummaryGallery
            currentBookId={story.id}
            refreshKey={refreshKey}
            charName={characterName ?? currentLine.session.character?.name}
            onEdit={openRecord}
          />
        ) : (
          <RecordWorkbench
            key={`${kind}:${selectedRecord?.id ?? `draft-${draftNonce}`}`}
            ref={workbenchRef}
            story={story}
            kind={kind}
            record={selectedRecord?.kind === kind ? selectedRecord : null}
            defaultBranchId={currentBranchId}
            onSaved={handleSaved}
            showEmptyEditor={false}
            configurationHeader={
              <Tabs value={kind} onValueChange={(value) => changeKind(value as SummaryKind)}>
                <TabsList className="flex w-full">
                  {KINDS.map((item) => (
                    <TabsTrigger key={item} value={item} className="flex-1 whitespace-nowrap">{SUMMARY_KIND_LABELS[item]}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            }
            sidePanel={
              <div className="space-y-4">
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={startManual}>
                    <NotebookText className="w-3.5 h-3.5" />手动添加总结
                  </Button>
                </div>
                <SavedSummaryList
                  currentBookId={story.id}
                  refreshKey={refreshKey}
                  session={currentLine.session}
                  onView={openRecord}
                  onRegenerate={regenerateRecord}
                  onChanged={refresh}
                />
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}
