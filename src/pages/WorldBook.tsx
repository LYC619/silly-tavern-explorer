import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { GuidedTour } from '@/components/GuidedTour';
import { AppLayout } from '@/components/AppLayout';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { WORLDBOOK_TOUR_STEPS, isTourCompleted, setTourCompleted } from '@/lib/tour-steps';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { AIUpdateDialog } from '@/components/worldbook/AIUpdateDialog';
import { QuickCreate } from '@/components/worldbook/QuickCreate';
import { WorldBookHeader, type WorldBookTab } from '@/components/worldbook/WorldBookHeader';
import { WorldBookEmptyState } from '@/components/worldbook/WorldBookEmptyState';
import { WorldBookBatchBar } from '@/components/worldbook/WorldBookBatchBar';
import { EntryFilterBar, type EntryViewMode } from '@/components/worldbook/EntryFilterBar';
import { EntryListPanel } from '@/components/worldbook/EntryListPanel';
import { EntryEditorPane } from '@/components/worldbook/EntryEditorPane';
import type { WorldBook, WorldBookItem } from '@/types/worldbook';
import { generateWorldBookId } from '@/types/worldbook';
import { saveWorldBook, getAllWorldBooks, getWorldBook, deleteWorldBook, pruneAutoSavedWorldBooks } from '@/lib/worldbook-db';
import { appendEntries } from '@/lib/worldbook-entry-copy';
import { planCowSave, buildDerivedMeta } from '@/lib/asset-cow';
import { getCharacter } from '@/lib/archive-db';
import { updateCharacterAssetReference } from '@/lib/character-asset-ref';
import { executeDeleteAction } from '@/lib/destructive-action';
import { takePendingToolFile, peekPendingToolFile } from '@/lib/tool-handoff';
import { estimateTokens } from '@/lib/preset-parser';
import { useToast } from '@/hooks/use-toast';
import { useWorldBookDraftState } from '@/hooks/use-worldbook-draft-state';
import { useWorldbookSession, useRestoredWbSession } from '@/hooks/use-worldbook-session';
import { useEntryFilters } from '@/hooks/use-entry-filters';
import { useBatchSelection } from '@/hooks/use-batch-selection';
import { useWorldbookEntries } from '@/hooks/use-worldbook-entries';
import { ToastAction } from '@/components/ui/toast';
import { readWorldBookUpload } from '@/lib/worldbook-file-import';

const undoAction = (undo: () => void) => <ToastAction altText="撤销" onClick={undo}>撤销</ToastAction>;

export default function WorldBookPage() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  // 角色上下文（角色页关联资产区「处理」进来）：保存走写时复制（定稿第七章）
  const [searchParams] = useSearchParams();
  const cowCharacterId = searchParams.get('characterId') ?? undefined;
  const initialAssetId = searchParams.get('assetId');
  const [cowCharacterName, setCowCharacterName] = useState('');

  const restored = useRestoredWbSession();
  const {
    worldbook,
    setWorldbook,
    hydrateWorldbook,
    markWorldbookClean,
    isDirty,
  } = useWorldBookDraftState(restored?.worldbook ?? null);
  const [filename, setFilename] = useState(restored?.filename ?? 'worldbook');
  const [currentItemId, setCurrentItemId] = useState<string | null>(restored?.currentItemId ?? null);
  const [stagedDialogOpen, setStagedDialogOpen] = useState(false);
  const [confirmLoadItem, setConfirmLoadItem] = useState<WorldBookItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorldBookItem | null>(null);
  const [savedItems, setSavedItems] = useState<WorldBookItem[]>([]);
  /** 「已暂存」读完之前，空态不能断言「你没有可恢复的世界书」 */
  const [savedLoaded, setSavedLoaded] = useState(false);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<EntryViewMode>('card');
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<WorldBookTab>('edit');
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [showTour, setShowTour] = useState(false);

  useWorldbookSession(worldbook, filename, currentItemId);

  // beforeunload guard for unsaved changes
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const allEntries = useMemo(
    () => (worldbook ? Object.entries(worldbook.entries) : []),
    [worldbook]
  );
  const selectedEntry = selectedUid && worldbook ? worldbook.entries[selectedUid] : null;

  const { controls, filteredEntries, pagedEntries, page, totalPages, setPage } = useEntryFilters(allEntries);

  // token 汇总（粗估）：启用条目才会注入上下文，故分开给启用/全部两个数
  const tokenStats = useMemo(() => {
    let enabled = 0, total = 0;
    for (const [, e] of allEntries) {
      const t = estimateTokens(e.content);
      total += t;
      if (e.enabled) enabled += t;
    }
    return { enabled, total };
  }, [allEntries]);

  const summary = useMemo(() => {
    if (!worldbook) return null;
    const enabled = tokenStats.enabled;
    return {
      title: `token 为粗略估算（CJK≈1字1token）。启用条目 ≈${enabled.toLocaleString()} / 全部 ≈${tokenStats.total.toLocaleString()} tokens`,
      text: `${controls.hasFilters ? `${filteredEntries.length} / ${allEntries.length} 条` : `${allEntries.length} 条`}`
        + ` · ≈${enabled >= 10000 ? `${(enabled / 1000).toFixed(1)}k` : enabled.toLocaleString()} tok(启用)`
        + ` · ${filename}`,
    };
  }, [worldbook, tokenStats, controls.hasFilters, filteredEntries.length, allEntries.length, filename]);

  // Auto-restore from IndexedDB on mount, or pick up AI-generated worldbook
  useEffect(() => {
    // 角色上下文：加载角色名（写时复制的副本命名用）
    if (cowCharacterId) {
      getCharacter(cowCharacterId).then(c => setCowCharacterName(c?.name ?? '')).catch(() => {});
    }

    // Check for AI-generated worldbook import
    const aiImport = sessionStorage.getItem('ai-worldbook-import');
    if (aiImport) {
      sessionStorage.removeItem('ai-worldbook-import');
      try {
        const parsed = JSON.parse(aiImport);
        if (parsed && parsed.entries) {
          setWorldbook(parsed);
          setFilename('AI 提取的世界书');
          toast({ title: '已导入 AI 生成的世界书数据' });
          return;
        }
      } catch { /* ignore */ }
    }

    // URL 指定资产（角色页「处理」直达）：优先于自动恢复
    if (initialAssetId) {
      Promise.all([getWorldBook(initialAssetId), getAllWorldBooks()]).then(([item, items]) => {
        setSavedItems(items);
        setSavedLoaded(true);
        if (item) {
          hydrateWorldbook(item.worldbook);
          setFilename(item.title);
          setCurrentItemId(item.id);
        } else {
          // 深链指向已删资产：以前什么都不发生，用户只看到一个空编辑器
          toast({
            title: '找不到这个世界书',
            description: '它可能已经被删除。当前是空白编辑器，不会覆盖任何已有资产。',
            variant: 'destructive',
          });
        }
      }).catch(() => setSavedLoaded(true));
      return;
    }

    // 处理区交接了文件时不自动恢复最近世界书——两个异步 setWorldbook 会竞态互相覆盖
    const hasHandoff = peekPendingToolFile('worldbook');
    getAllWorldBooks().then(items => {
      setSavedItems(items);
      setSavedLoaded(true);
      if (items.length > 0 && !worldbook && !hasHandoff) {
        const latest = items[0]; // already sorted by updatedAt desc
        hydrateWorldbook(latest.worldbook);
        setFilename(latest.title);
        setCurrentItemId(latest.id);
      }
    }).catch(() => setSavedLoaded(true));
    if (!isTourCompleted('worldbook')) {
      setTimeout(() => setShowTour(true), 500);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectEntry = useCallback((key: string) => {
    setSelectedUid(key);
    if (isMobile) setMobileEditorOpen(true);
  }, [isMobile]);

  const clearSelectedEntry = useCallback(() => {
    setSelectedUid(null);
    setMobileEditorOpen(false);
  }, []);

  const entryActions = useWorldbookEntries({
    worldbook, setWorldbook, selectedUid, selectEntry, clearSelectedEntry,
    switchToEditTab: useCallback(() => setActiveTab('edit'), []),
    toast, renderUndoAction: undoAction,
  });

  const batch = useBatchSelection({
    filteredEntries, worldbook, setWorldbook, selectedUid, clearSelectedEntry,
    toast, renderUndoAction: undoAction,
  });

  const handleImport = useCallback((wb: WorldBook, name: string, sourceModifiedAt?: number) => {
    setWorldbook(wb);
    setFilename(name);
    setSelectedUid(null);
    setActiveTab('edit');
    // 自动保留为导入历史（autoSaved），并裁剪到最近 5 份
    (async () => {
      const id = generateWorldBookId();
      const now = Date.now();
      await saveWorldBook({
        id,
        title: name,
        worldbook: wb,
        createdAt: now,
        updatedAt: now,
        autoSaved: true,
        ...(sourceModifiedAt === undefined ? {} : { sourceModifiedAt }),
      });
      setCurrentItemId(id);
      await pruneAutoSavedWorldBooks(5);
      setSavedItems(await getAllWorldBooks());
    })().catch(() => { /* 自动历史失败不阻塞导入 */ });
  }, [setWorldbook]);

  // 处理区入口交接来的文件：走与导入按钮相同的解析入库流程（只消费一次）
  const handoffConsumedRef = useRef(false);
  useEffect(() => {
    if (handoffConsumedRef.current) return;
    handoffConsumedRef.current = true;
    const file = takePendingToolFile('worldbook');
    if (!file) return;
    const fail = () => toast({ title: '导入失败', description: '无法解析为世界书 JSON', variant: 'destructive' });
    readWorldBookUpload(file).then((upload) => {
      try {
        const count = Object.keys(upload.worldbook.entries).length;
        handleImport(upload.worldbook, upload.title, upload.sourceModifiedAt);
        toast({ title: '导入成功', description: `已加载 ${count} 个条目` });
      } catch { fail(); }
    }).catch(fail);
  }, [handleImport, toast]);

  const handleSaveLocal = useCallback(async () => {
    if (!worldbook) return;
    const now = Date.now();
    const base = currentItemId ? savedItems.find(s => s.id === currentItemId) : undefined;

    // 角色上下文 + 已入库的资产：写时复制（定稿第七章）——原资产不动，改动落到该角色的派生副本
    if (cowCharacterId && base) {
      const plan = planCowSave(base, cowCharacterId, cowCharacterName, savedItems);
      let targetId: string;
      if (plan.action === 'update') {
        targetId = plan.targetId;
        await saveWorldBook({
          ...base,
          title: filename,
          worldbook,
          ...(base.derived ? { derived: { ...base.derived, updatedAt: now } } : {}),
          updatedAt: now,
          autoSaved: false,
        });
        toast({ title: '已保存', description: '永久留存，不会被自动清理' });
      } else if (plan.action === 'redirect') {
        targetId = plan.targetId;
        const copy = savedItems.find(s => s.id === plan.targetId)!;
        await saveWorldBook({
          ...copy,
          worldbook,
          derived: copy.derived ? { ...copy.derived, updatedAt: now } : copy.derived,
          updatedAt: now,
          autoSaved: false,
        });
        setFilename(copy.title);
        toast({ title: `已更新派生副本「${copy.title}」`, description: '原世界书未改动' });
      } else {
        targetId = generateWorldBookId();
        await saveWorldBook({
          id: targetId,
          title: plan.copyTitle,
          worldbook,
          derived: buildDerivedMeta(plan.derivedFrom, cowCharacterId),
          createdAt: now,
          updatedAt: now,
          autoSaved: false,
        });
        setFilename(plan.copyTitle);
        toast({ title: '已生成派生副本', description: `「${plan.copyTitle}」，原世界书与其他角色不受影响` });
      }
      // 该角色的引用切到副本
      await updateCharacterAssetReference(cowCharacterId, 'worldbook', base.id, targetId, now);
      setCurrentItemId(targetId);
      markWorldbookClean(worldbook);
      setSavedItems(await getAllWorldBooks());
      return;
    }

    const id = currentItemId || generateWorldBookId();
    const item: WorldBookItem = {
      id,
      title: filename,
      worldbook,
      createdAt: currentItemId ? (savedItems.find(s => s.id === id)?.createdAt ?? now) : now,
      updatedAt: now,
      autoSaved: false, // 手动保存 → 永久留存，不参与最近 5 份自动清理
      ...(base?.derived ? { derived: base.derived } : {}),
      ...(base?.sourceModifiedAt === undefined ? {} : { sourceModifiedAt: base.sourceModifiedAt }),
    };
    await saveWorldBook(item);
    // 角色上下文里保存全新世界书：入库并直接挂到该角色名下
    if (cowCharacterId && !base) {
      await updateCharacterAssetReference(cowCharacterId, 'worldbook', id, id, now);
    }
    setCurrentItemId(id);
    markWorldbookClean(worldbook);
    setSavedItems(await getAllWorldBooks());
    toast({ title: '已保存', description: '永久留存，不会被自动清理' });
  }, [worldbook, filename, currentItemId, savedItems, cowCharacterId, cowCharacterName, toast, markWorldbookClean]);

  // Ctrl+S / Cmd+S to save (declared after handleSaveLocal to avoid TDZ)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (worldbook) handleSaveLocal();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [worldbook, handleSaveLocal]);

  const handleBatchDelete = useCallback(() => {
    const count = batch.removeSelected();
    toast({ title: '已删除', description: `已删除 ${count} 个条目` });
  }, [batch, toast]);

  // 条目跨书复制/转移（阶段9.8 余项）：目标=资产库里另一本世界书，直接落库；
  // 「转移」再从当前书移除（当前书走正常 dirty→手动保存流程）
  const handleBatchCopyTo = useCallback(async (targetId: string, move: boolean) => {
    const entries = batch.selectedEntries();
    if (entries.length === 0) return;
    try {
      const target = await getWorldBook(targetId);
      if (!target) {
        toast({ title: '目标世界书不存在', description: '可能刚被删除，请刷新后重试', variant: 'destructive' });
        return;
      }
      await saveWorldBook({ ...target, worldbook: appendEntries(target.worldbook, entries), updatedAt: Date.now() });
      setSavedItems(await getAllWorldBooks());
      if (move) batch.removeSelected();
      toast({
        title: move ? '已转移' : '已复制',
        description: `${entries.length} 个条目 → 「${target.title}」${move ? '（当前书的移除记得保存）' : '，原条目保留'}`,
      });
    } catch {
      toast({ title: move ? '转移失败' : '复制失败', variant: 'destructive' });
    }
  }, [batch, toast]);

  const doLoadStaged = useCallback((item: WorldBookItem) => {
    hydrateWorldbook(item.worldbook);
    setFilename(item.title);
    setCurrentItemId(item.id);
    setSelectedUid(null);
    setStagedDialogOpen(false);
    setConfirmLoadItem(null);
    toast({ title: '已加载', description: `已加载「${item.title}」` });
  }, [hydrateWorldbook, toast]);

  const handleLoadStaged = useCallback((item: WorldBookItem) => {
    if (isDirty) setConfirmLoadItem(item);
    else doLoadStaged(item);
  }, [isDirty, doLoadStaged]);

  const handleDeleteStaged = useCallback(async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const deleted = await executeDeleteAction(async () => {
      await deleteWorldBook(target.id);
      setSavedItems(await getAllWorldBooks());
      if (currentItemId === target.id) setCurrentItemId(null);
    }, {
      onSuccess: () => toast({ title: `已删除世界书「${target.title}」` }),
      onFailure: () => toast({ title: '删除世界书失败', variant: 'destructive' }),
    });
    if (deleted) setDeleteTarget(null);
  }, [currentItemId, deleteTarget, toast]);

  return (
    <AppLayout>
      <div className="bg-background flex h-full min-h-0 flex-col overflow-hidden">
        <WorldBookHeader
          worldbook={worldbook}
          filename={filename}
          cowCharacterName={cowCharacterId ? cowCharacterName : ''}
          summary={summary}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onImport={handleImport}
          onAppend={entryActions.appendWorldbook}
          onOpenAiDialog={() => setAiDialogOpen(true)}
          savedItems={savedItems}
          stagedDialogOpen={stagedDialogOpen}
          onStagedDialogOpenChange={setStagedDialogOpen}
          onRefreshStaged={() => { getAllWorldBooks().then(setSavedItems).catch(() => {}); }}
          onLoadStaged={handleLoadStaged}
          onDeleteStaged={setDeleteTarget}
          onSave={handleSaveLocal}
        >
          <AlertDialog open={!!confirmLoadItem} onOpenChange={(open) => !open && setConfirmLoadItem(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认切换</AlertDialogTitle>
                <AlertDialogDescription>
                  当前编辑中的世界书将被替换为「{confirmLoadItem?.title}」，未暂存的修改将丢失。是否继续？
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={() => confirmLoadItem && doLoadStaged(confirmLoadItem)}>
                  确认加载
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <DeleteConfirmDialog
            open={!!deleteTarget}
            title={`删除世界书「${deleteTarget?.title ?? ''}」？`}
            description="此操作不可恢复。若角色仍引用该世界书，角色页会显示引用失效。"
            onOpenChange={(open) => !open && setDeleteTarget(null)}
            onConfirm={() => void handleDeleteStaged()}
          />
        </WorldBookHeader>

        {/* Body */}
        {activeTab === 'quick' ? (
          <ScrollArea className="flex-1 min-h-0">
            <QuickCreate
              existingWorldbook={worldbook}
              onAddToWorldbook={entryActions.quickAddEntries}
            />
          </ScrollArea>
        ) : (
          <div className="flex-1 min-h-0 flex overflow-hidden">
            {!worldbook ? (
              <WorldBookEmptyState
                savedItems={savedItems}
                savedLoaded={savedLoaded}
                onImport={handleImport}
                onRestore={(item) => {
                  hydrateWorldbook(item.worldbook);
                  setFilename(item.title);
                  setCurrentItemId(item.id);
                }}
                onDelete={setDeleteTarget}
              />
            ) : (
              <>
                {/* Left: entries */}
                <div className="flex-1 min-w-0 md:border-r flex h-full min-h-0 flex-col">
                  <div className="shrink-0 border-b bg-card/60 backdrop-blur px-4 py-2 space-y-2">
                    {batch.batchMode ? (
                      <WorldBookBatchBar
                        batch={batch}
                        totalFiltered={filteredEntries.length}
                        savedItems={savedItems}
                        currentItemId={currentItemId}
                        onBatchDelete={handleBatchDelete}
                        onBatchCopyTo={handleBatchCopyTo}
                      />
                    ) : (
                      <EntryFilterBar
                        controls={controls}
                        viewMode={viewMode}
                        onViewModeChange={setViewMode}
                        onAddEntry={entryActions.addEntry}
                        onEnterBatch={batch.enterBatchMode}
                        entries={worldbook.entries}
                        onPrefixCategorize={entryActions.applyPrefixCategorize}
                      />
                    )}
                  </div>

                  <EntryListPanel
                    pagedEntries={pagedEntries}
                    viewMode={viewMode}
                    selectedUid={selectedUid}
                    onSelect={selectEntry}
                    onToggleEnabled={entryActions.toggleEnabled}
                    onDelete={entryActions.deleteEntry}
                    batchMode={batch.batchMode}
                    batchSelected={batch.batchSelected}
                    onBatchToggle={batch.toggleBatchItem}
                    showFilteredEmpty={filteredEntries.length === 0 && controls.hasFilters}
                    page={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    paginated={controls.pageSize > 0}
                  />
                </div>

                {/* Right: 条目编辑器（桌面右栏 / 移动端抽屉） */}
                <EntryEditorPane
                  entry={selectedEntry}
                  entryKey={selectedUid}
                  onChange={entryActions.updateEntry}
                  onDelete={entryActions.deleteEntry}
                  isMobile={isMobile}
                  mobileOpen={mobileEditorOpen}
                  onMobileOpenChange={setMobileEditorOpen}
                />
              </>
            )}
          </div>
        )}

        {/* Guided Tour */}
        {showTour && (
          <GuidedTour
            steps={WORLDBOOK_TOUR_STEPS}
            module="worldbook"
            onComplete={() => { setTourCompleted('worldbook'); setShowTour(false); }}
            onSkip={() => { setTourCompleted('worldbook'); setShowTour(false); }}
          />
        )}

        <AIUpdateDialog
          open={aiDialogOpen}
          onOpenChange={setAiDialogOpen}
          existingEntries={allEntries.map(([, e]) => e)}
          onAppend={entryActions.appendWorldbook}
        />
      </div>
    </AppLayout>
  );
}
