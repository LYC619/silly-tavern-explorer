import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { Globe, LayoutGrid, List, Library, Plus, Trash2, Save, Search, X, CheckSquare, Clock, FolderOpen, Archive, SlidersHorizontal, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { GuidedTour } from '@/components/GuidedTour';
import { AppLayout } from '@/components/AppLayout';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { WORLDBOOK_TOUR_STEPS, isTourCompleted, setTourCompleted } from '@/lib/tour-steps';
import { PrefixCategorize } from '@/components/worldbook/PrefixCategorize';
import { BatchOperations } from '@/components/worldbook/BatchOperations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toggle } from '@/components/ui/toggle';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { WorldBookImporter } from '@/components/worldbook/WorldBookImporter';
import { WorldBookExporter } from '@/components/worldbook/WorldBookExporter';
import { AIUpdateDialog } from '@/components/worldbook/AIUpdateDialog';
import { EntryCard } from '@/components/worldbook/EntryCard';
import { EntryListRow } from '@/components/worldbook/EntryListRow';
import { EntryEditor } from '@/components/worldbook/EntryEditor';
import { QuickCreate } from '@/components/worldbook/QuickCreate';
import type { WorldBook, WorldBookEntry } from '@/types/worldbook';
import { DEFAULT_ENTRY, POSITION_LABELS, generateWorldBookId } from '@/types/worldbook';
import { saveWorldBook, getAllWorldBooks, getWorldBook, deleteWorldBook, pruneAutoSavedWorldBooks } from '@/lib/worldbook-db';
import { appendEntries } from '@/lib/worldbook-entry-copy';
import { planCowSave, buildDerivedMeta } from '@/lib/asset-cow';
import { getCharacter } from '@/lib/archive-db';
import { updateCharacterAssetReference } from '@/lib/character-asset-ref';
import { executeDeleteAction } from '@/lib/destructive-action';
import { shouldIgnoreGlobalShortcut } from '@/lib/keyboard-shortcuts';
import { takePendingToolFile, peekPendingToolFile } from '@/lib/tool-handoff';
import { estimateTokens } from '@/lib/preset-parser';
import type { WorldBookItem } from '@/types/worldbook';
import { useToast } from '@/hooks/use-toast';
import { useWorldBookDraftState } from '@/hooks/use-worldbook-draft-state';
import { ToastAction } from '@/components/ui/toast';
import { readWorldBookUpload } from '@/lib/worldbook-file-import';

type SortMode = 'order-asc' | 'order-desc' | 'title' | 'uid';

/** 跨页面切换时暂存当前编辑中的世界书，避免切到聊天处理再回来丢失 */
const WB_SESSION_KEY = 'wb-active-session';
interface WbSession { worldbook: WorldBook; filename: string; currentItemId: string | null; }
function loadWbSession(): WbSession | null {
  try {
    const raw = sessionStorage.getItem(WB_SESSION_KEY);
    return raw ? (JSON.parse(raw) as WbSession) : null;
  } catch { return null; }
}

export default function WorldBookPage() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  // 角色上下文（角色页关联资产区「处理」进来）：保存走写时复制（定稿第七章）
  const [searchParams] = useSearchParams();
  const cowCharacterId = searchParams.get('characterId') ?? undefined;
  const initialAssetId = searchParams.get('assetId');
  const [cowCharacterName, setCowCharacterName] = useState('');

  const restored = loadWbSession();
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
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'quick'>('edit');
  const [batchMode, setBatchMode] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<'all' | 'title'>('all');
  const [filterConstant, setFilterConstant] = useState(false);
  const [filterKeyword, setFilterKeyword] = useState(false);
  const [filterVector, setFilterVector] = useState(false);
  const [filterEnabled, setFilterEnabled] = useState(false);
  const [filterDisabled, setFilterDisabled] = useState(false);
  const [filterPosition, setFilterPosition] = useState<string>('all');
  const [sortMode, setSortMode] = useState<SortMode>('order-asc');
  const [showTour, setShowTour] = useState(false);
  // 分页：每页条数 + 当前页(1-based)。pageSize=0 表示全部
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  // beforeunload guard for unsaved changes
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // 跨页面切换持久化：当前世界书写入 sessionStorage，切到别的页再回来不丢
  useEffect(() => {
    try {
      if (worldbook) {
        sessionStorage.setItem(WB_SESSION_KEY, JSON.stringify({ worldbook, filename, currentItemId }));
      } else {
        sessionStorage.removeItem(WB_SESSION_KEY);
      }
    } catch { /* sessionStorage 满或不可用时忽略，不影响使用 */ }
  }, [worldbook, filename, currentItemId]);

  const allEntries = useMemo(
    () => worldbook ? Object.entries(worldbook.entries) : [],
    [worldbook]
  );
  const selectedEntry = selectedUid && worldbook ? worldbook.entries[selectedUid] : null;

  // token 汇总（粗估）：启用条目才会注入上下文，故分开给启用/全部两个数
  const tokenStats = useMemo(() => {
    let enabled = 0;
    let total = 0;
    for (const [, e] of allEntries) {
      const t = estimateTokens(e.content);
      total += t;
      if (e.enabled) enabled += t;
    }
    return { enabled, total };
  }, [allEntries]);

  const hasFilters = searchQuery || filterConstant || filterKeyword || filterVector || filterEnabled || filterDisabled || filterPosition !== 'all';

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
        if (item) {
          hydrateWorldbook(item.worldbook);
          setFilename(item.title);
          setCurrentItemId(item.id);
        }
      }).catch(() => {});
      return;
    }

    // 处理区交接了文件时不自动恢复最近世界书——两个异步 setWorldbook 会竞态互相覆盖
    const hasHandoff = peekPendingToolFile('worldbook');
    getAllWorldBooks().then(items => {
      setSavedItems(items);
      if (items.length > 0 && !worldbook && !hasHandoff) {
        const latest = items[0]; // already sorted by updatedAt desc
        hydrateWorldbook(latest.worldbook);
        setFilename(latest.title);
        setCurrentItemId(latest.id);
      }
    }).catch(() => {});
    if (!isTourCompleted('worldbook')) {
      setTimeout(() => setShowTour(true), 500);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredEntries = useMemo(() => {
    let result = allEntries;

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(([, e]) =>
        searchScope === 'title'
          ? e.comment.toLowerCase().includes(q)
          : e.comment.toLowerCase().includes(q) ||
            e.key.some(k => k.toLowerCase().includes(q)) ||
            e.content.toLowerCase().includes(q)
      );
    }

    // Strategy filters (OR logic when multiple active)
    const strategyFilters = filterConstant || filterKeyword || filterVector;
    if (strategyFilters) {
      result = result.filter(([, e]) => {
        if (filterConstant && e.constant) return true;
        if (filterVector && e.vectorized) return true;
        if (filterKeyword && !e.constant && !e.vectorized) return true;
        return false;
      });
    }

    // Enabled/disabled
    if (filterEnabled && !filterDisabled) result = result.filter(([, e]) => e.enabled);
    if (filterDisabled && !filterEnabled) result = result.filter(([, e]) => !e.enabled);

    // Position
    if (filterPosition !== 'all') {
      const pos = Number(filterPosition);
      result = result.filter(([, e]) => e.position === pos);
    }

    // Sort
    result = [...result].sort((a, b) => {
      const [, ea] = a, [, eb] = b;
      switch (sortMode) {
        case 'order-asc': return ea.order - eb.order;
        case 'order-desc': return eb.order - ea.order;
        case 'title': return ea.comment.localeCompare(eb.comment);
        case 'uid': return ea.uid - eb.uid;
        default: return 0;
      }
    });

    return result;
  }, [allEntries, searchQuery, searchScope, filterConstant, filterKeyword, filterVector, filterEnabled, filterDisabled, filterPosition, sortMode]);

  // 分页：总页数 + 当前页切片。pageSize=0 → 全部
  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(filteredEntries.length / pageSize)) : 1;
  const pagedEntries = useMemo(() => {
    if (pageSize <= 0) return filteredEntries;
    const start = (page - 1) * pageSize;
    return filteredEntries.slice(start, start + pageSize);
  }, [filteredEntries, page, pageSize]);

  // 筛选/搜索/排序变化或页数缩减时，把当前页夹回有效范围
  useEffect(() => {
    setPage(p => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);
  useEffect(() => {
    setPage(1);
  }, [searchQuery, searchScope, filterConstant, filterKeyword, filterVector, filterEnabled, filterDisabled, filterPosition, pageSize]);

  // 激活的筛选项数量（给「筛选」按钮角标）
  const activeFilterCount =
    (filterConstant ? 1 : 0) + (filterKeyword ? 1 : 0) + (filterVector ? 1 : 0) +
    (filterEnabled ? 1 : 0) + (filterDisabled ? 1 : 0) + (filterPosition !== 'all' ? 1 : 0);

  const clearFilters = () => {
    setSearchQuery('');
    setFilterConstant(false);
    setFilterKeyword(false);
    setFilterVector(false);
    setFilterEnabled(false);
    setFilterDisabled(false);
    setFilterPosition('all');
  };

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
      const updated = await getAllWorldBooks();
      setSavedItems(updated);
    })().catch(() => { /* 自动历史失败不阻塞导入 */ });
  }, [setWorldbook]);

  // 处理区入口交接来的文件：走与导入按钮相同的解析入库流程（只消费一次）
  const handoffConsumedRef = useRef(false);
  useEffect(() => {
    if (handoffConsumedRef.current) return;
    handoffConsumedRef.current = true;
    const file = takePendingToolFile('worldbook');
    if (!file) return;
    readWorldBookUpload(file).then((upload) => {
      try {
        const count = Object.keys(upload.worldbook.entries).length;
        handleImport(upload.worldbook, upload.title, upload.sourceModifiedAt);
        toast({ title: '导入成功', description: `已加载 ${count} 个条目` });
      } catch {
        toast({ title: '导入失败', description: '无法解析为世界书 JSON', variant: 'destructive' });
      }
    }).catch(() => toast({ title: '导入失败', description: '无法解析为世界书 JSON', variant: 'destructive' }));
  }, [handleImport, toast]);

  const handleAppend = useCallback((wb: WorldBook) => {
    setWorldbook(prev => {
      if (!prev) return wb;
      const maxKey = Math.max(-1, ...Object.keys(prev.entries).map(Number).filter(n => !isNaN(n)));
      const maxUid = Object.values(prev.entries).reduce((max, e) => Math.max(max, e.uid), -1);
      const updated = { ...prev.entries };
      const newEntries = Object.values(wb.entries);
      newEntries.forEach((e, i) => {
        updated[String(maxKey + 1 + i)] = { ...e, uid: maxUid + 1 + i };
      });
      return { ...prev, entries: updated };
    });
    const newCount = Object.keys(wb.entries).length;
    setActiveTab('edit');
    // Toast after state update
    setTimeout(() => {
      toast({
        title: '追加成功',
        description: `已追加 ${newCount} 个条目`,
      });
    }, 0);
  }, [setWorldbook, toast]);

  const updateEntry = useCallback((key: string, updated: WorldBookEntry) => {
    setWorldbook(prev => {
      if (!prev) return prev;
      return { ...prev, entries: { ...prev.entries, [key]: updated } };
    });
  }, [setWorldbook]);

  const toggleEnabled = useCallback((key: string, enabled: boolean) => {
    setWorldbook(prev => {
      if (!prev) return prev;
      const entry = prev.entries[key];
      return { ...prev, entries: { ...prev.entries, [key]: { ...entry, enabled } } };
    });
  }, [setWorldbook]);

  const addEntry = useCallback(() => {
    if (!worldbook) return;
    const maxUid = Object.values(worldbook.entries).reduce((max, e) => Math.max(max, e.uid), -1);
    const newUid = maxUid + 1;
    const key = String(newUid);
    const newEntry: WorldBookEntry = { ...DEFAULT_ENTRY, uid: newUid, comment: '新条目' } as WorldBookEntry;
    setWorldbook(prev => prev ? { ...prev, entries: { ...prev.entries, [key]: newEntry } } : prev);
    setSelectedUid(key);
    if (isMobile) setMobileEditorOpen(true);
  }, [worldbook, isMobile, setWorldbook]);

  const deleteEntry = useCallback((key: string) => {
    let removed: WorldBookEntry | undefined;
    setWorldbook(prev => {
      if (!prev) return prev;
      removed = prev.entries[key];
      const { [key]: _, ...rest } = prev.entries;
      return { ...prev, entries: rest };
    });
    if (selectedUid === key) {
      setSelectedUid(null);
      setMobileEditorOpen(false);
    }
    if (removed) {
      const restore = removed;
      toast({
        title: '已删除条目',
        description: restore.comment || `条目 ${restore.uid}`,
        action: (
          <ToastAction altText="撤销" onClick={() => {
            setWorldbook(prev => (prev ? { ...prev, entries: { ...prev.entries, [key]: restore } } : prev));
          }}>撤销</ToastAction>
        ),
      });
    }
  }, [selectedUid, setWorldbook, toast]);

  const handleSelectEntry = useCallback((key: string) => {
    setSelectedUid(key);
    if (isMobile) setMobileEditorOpen(true);
  }, [isMobile]);

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
    // Refresh saved items list
    const updated = await getAllWorldBooks();
    setSavedItems(updated);
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

  const handleQuickAddEntries = useCallback((newEntries: WorldBookEntry[]) => {
    setWorldbook(prev => {
      if (!prev) {
        // Create new worldbook; key by uid to keep ST-compatible mapping
        const entries: Record<string, WorldBookEntry> = {};
        newEntries.forEach((e) => { entries[String(e.uid)] = e; });
        return { entries };
      }
      const updated = { ...prev.entries };
      newEntries.forEach((e) => { updated[String(e.uid)] = e; });
      return { ...prev, entries: updated };
    });
    setActiveTab('edit');
    toast({ title: '已添加', description: `${newEntries.length} 个条目已添加到世界书` });
  }, [setWorldbook, toast]);


  const handlePrefixCategorize = useCallback((updates: Record<string, { group: string; comment: string; order: number }>) => {
    setWorldbook(prev => {
      if (!prev) return prev;
      const updated = { ...prev.entries };
      Object.entries(updates).forEach(([key, { group, comment, order }]) => {
        if (updated[key]) {
          updated[key] = { ...updated[key], group, comment, order };
        }
      });
      return { ...prev, entries: updated };
    });
    toast({ title: '归类完成', description: `已更新 ${Object.keys(updates).length} 个条目的标签、前缀和 Order` });
  }, [setWorldbook, toast]);

  // Batch mode
  const exitBatchMode = useCallback(() => {
    setBatchMode(false);
    setBatchSelected(new Set());
  }, []);

  const batchUndoRef = useRef<WorldBook | null>(null);
  const undoBatch = useCallback(() => {
    if (batchUndoRef.current) {
      setWorldbook(batchUndoRef.current);
      batchUndoRef.current = null;
      toast({ title: '已撤销' });
    }
  }, [setWorldbook, toast]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (shouldIgnoreGlobalShortcut(e)) return;
      if (e.key === 'Escape' && batchMode) exitBatchMode();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [batchMode, exitBatchMode]);

  const lastBatchKeyRef = useRef<string | null>(null);
  const toggleBatchItem = useCallback((key: string, checked: boolean, shiftKey?: boolean) => {
    // Shift 连选：从上次点击的条目到当前条目（按当前过滤后的显示顺序）整段设为 checked
    if (shiftKey && lastBatchKeyRef.current) {
      const order = filteredEntries.map(([k]) => k);
      const from = order.indexOf(lastBatchKeyRef.current);
      const to = order.indexOf(key);
      if (from !== -1 && to !== -1) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        const range = order.slice(lo, hi + 1);
        setBatchSelected(prev => {
          const next = new Set(prev);
          range.forEach(k => (checked ? next.add(k) : next.delete(k)));
          return next;
        });
        lastBatchKeyRef.current = key;
        return;
      }
    }
    setBatchSelected(prev => {
      const next = new Set(prev);
      if (checked) next.add(key); else next.delete(key);
      return next;
    });
    lastBatchKeyRef.current = key;
  }, [filteredEntries]);

  const handleBatchPrefix = useCallback((prefix: string) => {
    batchUndoRef.current = worldbook;
    setWorldbook(prev => {
      if (!prev) return prev;
      const updated = { ...prev.entries };
      batchSelected.forEach(key => {
        if (updated[key] && !updated[key].comment.startsWith(prefix)) {
          updated[key] = { ...updated[key], comment: prefix + updated[key].comment };
        }
      });
      return { ...prev, entries: updated };
    });
    toast({
      title: '前缀已添加',
      description: `已为 ${batchSelected.size} 个条目添加前缀`,
      action: <ToastAction altText="撤销" onClick={undoBatch}>撤销</ToastAction>,
    });
  }, [batchSelected, worldbook, setWorldbook, toast, undoBatch]);

  const handleBatchDelete = useCallback(() => {
    const count = batchSelected.size;
    setWorldbook(prev => {
      if (!prev) return prev;
      const updated = { ...prev.entries };
      batchSelected.forEach(key => { delete updated[key]; });
      return { ...prev, entries: updated };
    });
    if (selectedUid && batchSelected.has(selectedUid)) {
      setSelectedUid(null);
      setMobileEditorOpen(false);
    }
    setBatchSelected(new Set());
    toast({ title: '已删除', description: `已删除 ${count} 个条目` });
  }, [batchSelected, selectedUid, setWorldbook, toast]);

  // 条目跨书复制/转移（阶段9.8 余项）：目标=资产库里另一本世界书，直接落库；
  // 「转移」再从当前书移除（当前书走正常 dirty→手动保存流程）
  const handleBatchCopyTo = useCallback(async (targetId: string, move: boolean) => {
    if (!worldbook) return;
    const entries = [...batchSelected].map((k) => worldbook.entries[k]).filter(Boolean);
    if (entries.length === 0) return;
    try {
      const target = await getWorldBook(targetId);
      if (!target) {
        toast({ title: '目标世界书不存在', description: '可能刚被删除，请刷新后重试', variant: 'destructive' });
        return;
      }
      await saveWorldBook({ ...target, worldbook: appendEntries(target.worldbook, entries), updatedAt: Date.now() });
      setSavedItems(await getAllWorldBooks());
      if (move) {
        setWorldbook(prev => {
          if (!prev) return prev;
          const updated = { ...prev.entries };
          batchSelected.forEach(key => { delete updated[key]; });
          return { ...prev, entries: updated };
        });
        if (selectedUid && batchSelected.has(selectedUid)) {
          setSelectedUid(null);
          setMobileEditorOpen(false);
        }
        setBatchSelected(new Set());
      }
      toast({
        title: move ? '已转移' : '已复制',
        description: `${entries.length} 个条目 → 「${target.title}」${move ? '（当前书的移除记得保存）' : '，原条目保留'}`,
      });
    } catch {
      toast({ title: move ? '转移失败' : '复制失败', variant: 'destructive' });
    }
  }, [worldbook, batchSelected, selectedUid, setWorldbook, toast]);

  const handleBatchPosition = useCallback((position: number, depth?: number, role?: number) => {
    batchUndoRef.current = worldbook;
    setWorldbook(prev => {
      if (!prev) return prev;
      const updated = { ...prev.entries };
      batchSelected.forEach(key => {
        if (updated[key]) {
          updated[key] = {
            ...updated[key],
            position,
            ...(depth !== undefined ? { depth } : {}),
            ...(role !== undefined ? { role } : {}),
          };
        }
      });
      return { ...prev, entries: updated };
    });
    toast({
      title: '位置已修改',
      description: `已修改 ${batchSelected.size} 个条目的插入位置`,
      action: <ToastAction altText="撤销" onClick={undoBatch}>撤销</ToastAction>,
    });
  }, [batchSelected, worldbook, setWorldbook, toast, undoBatch]);

  const handleBatchStrategy = useCallback((strategy: 'keyword' | 'constant' | 'vectorized') => {
    batchUndoRef.current = worldbook;
    setWorldbook(prev => {
      if (!prev) return prev;
      const updated = { ...prev.entries };
      batchSelected.forEach(key => {
        if (updated[key]) {
          updated[key] = {
            ...updated[key],
            constant: strategy === 'constant',
            vectorized: strategy === 'vectorized',
          };
        }
      });
      return { ...prev, entries: updated };
    });
    toast({
      title: '策略已修改',
      description: `已修改 ${batchSelected.size} 个条目的触发策略`,
      action: <ToastAction altText="撤销" onClick={undoBatch}>撤销</ToastAction>,
    });
  }, [batchSelected, worldbook, setWorldbook, toast, undoBatch]);

  const handleBatchEnable = useCallback((enabled: boolean) => {
    batchUndoRef.current = worldbook;
    setWorldbook(prev => {
      if (!prev) return prev;
      const updated = { ...prev.entries };
      batchSelected.forEach(key => {
        if (updated[key]) {
          updated[key] = { ...updated[key], enabled };
        }
      });
      return { ...prev, entries: updated };
    });
    toast({
      title: enabled ? '已启用' : '已停用',
      description: `已${enabled ? '启用' : '停用'} ${batchSelected.size} 个条目`,
      action: <ToastAction altText="撤销" onClick={undoBatch}>撤销</ToastAction>,
    });
  }, [batchSelected, worldbook, setWorldbook, toast, undoBatch]);

  const hasUnsavedChanges = isDirty;

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
    if (hasUnsavedChanges) {
      setConfirmLoadItem(item);
    } else {
      doLoadStaged(item);
    }
  }, [hasUnsavedChanges, doLoadStaged]);

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

  const editorContent = selectedEntry && selectedUid ? (
    <>
      <EntryEditor
        entry={selectedEntry}
        onChange={(updated) => updateEntry(selectedUid, updated)}
      />
      <div className="px-4 pb-4">
        <Button variant="destructive" size="sm" onClick={() => deleteEntry(selectedUid)}>
          <Trash2 className="w-4 h-4 mr-1" /> 删除此条目
        </Button>
      </div>
    </>
  ) : null;

  return (
    <AppLayout>
      <div className="bg-background flex h-full min-h-0 flex-col overflow-hidden">
      {/* 页内工具栏 */}
      <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 h-14 flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          <h1 className="font-semibold text-foreground text-lg mr-2 hidden sm:block">世界书编辑器</h1>
          {cowCharacterId && cowCharacterName && (
            <Badge variant="secondary" className="shrink-0" title="从角色页进入的处理：保存共享世界书时会生成该角色的派生副本，原资产不动">
              为「{cowCharacterName}」处理
            </Badge>
          )}

          {/* 条目计数 + token 粗估 + 世界书名（从置顶栏移到顶部） */}
          {worldbook && (
            <span
              className="text-xs text-muted-foreground truncate max-w-[340px] hidden md:inline"
              title={`token 为粗略估算（CJK≈1字1token）。启用条目 ≈${tokenStats.enabled.toLocaleString()} / 全部 ≈${tokenStats.total.toLocaleString()} tokens`}
            >
              {hasFilters
                ? `${filteredEntries.length} / ${allEntries.length} 条`
                : `${allEntries.length} 条`}
              {` · ≈${tokenStats.enabled >= 10000 ? `${(tokenStats.enabled / 1000).toFixed(1)}k` : tokenStats.enabled.toLocaleString()} tok(启用)`}
              {` · ${filename}`}
            </span>
          )}

          {/* Tab switcher */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'edit' | 'quick')} className="hidden sm:block">
            <TabsList className="h-8">
              <TabsTrigger value="edit" className="text-xs px-3 h-6">编辑模式</TabsTrigger>
              <TabsTrigger value="quick" className="text-xs px-3 h-6">快速添加</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex-1" />

          <div data-tour="wb-import">
            <WorldBookImporter onImport={handleImport} onAppend={handleAppend} hasExisting={!!worldbook} />
          </div>

          {worldbook && (
            <Button data-tour="wb-ai" variant="outline" size="sm" onClick={() => setAiDialogOpen(true)} title="根据聊天记录用 AI 提炼新设定，追加为新条目">
              <Sparkles className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">AI 追加</span>
            </Button>
          )}

          <Dialog open={stagedDialogOpen} onOpenChange={setStagedDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" data-tour="wb-staged" onClick={() => {
                getAllWorldBooks().then(items => setSavedItems(items));
              }}>
                <Archive className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">已暂存</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>已暂存的世界书</DialogTitle>
              </DialogHeader>
              {savedItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">暂无暂存记录</p>
              ) : (
                <div className="space-y-2">
                  {savedItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                      <button
                        className="flex-1 text-left"
                        onClick={() => handleLoadStaged(item)}
                      >
                        <div className="font-medium text-sm text-foreground">{item.title}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                          <span>{Object.keys(item.worldbook.entries).length} 条目</span>
                          <span>·</span>
                          <span>{new Date(item.sourceModifiedAt ?? item.updatedAt).toLocaleString()}</span>
                        </div>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(item); }}
                        aria-label="删除暂存"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </DialogContent>
          </Dialog>

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

          {worldbook && activeTab === 'edit' && (
            <>
              <Button variant="outline" size="sm" onClick={handleSaveLocal} className="hidden sm:inline-flex">
                <Save className="w-4 h-4 mr-1" /> 保存
              </Button>
              <WorldBookExporter worldbook={worldbook} filename={filename} />
            </>
          )}
        </div>

        {/* Mobile tab switcher */}
        <div className="sm:hidden px-4 pb-2">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'edit' | 'quick')}>
            <TabsList className="w-full h-8">
              <TabsTrigger value="edit" className="text-xs flex-1 h-6">编辑模式</TabsTrigger>
              <TabsTrigger value="quick" className="text-xs flex-1 h-6">快速添加</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      {/* Body */}
      {activeTab === 'quick' ? (
        <ScrollArea className="flex-1 min-h-0">
          <QuickCreate
            existingWorldbook={worldbook}
            onAddToWorldbook={handleQuickAddEntries}
          />
        </ScrollArea>
      ) : (
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {!worldbook ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4 px-4 max-w-lg w-full">
                <Globe className="w-16 h-16 mx-auto text-muted-foreground/40" />
                <h2 className="text-xl font-semibold text-foreground">开始使用世界书编辑器</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  导入 SillyTavern 的世界书 JSON 文件，可视化浏览和编辑所有条目，然后导出为兼容格式。
                </p>
                <WorldBookImporter onImport={handleImport} />

                {savedItems.length > 0 && (
                  <div className="mt-8 text-left space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <FolderOpen className="w-4 h-4" />
                      从本地恢复
                    </div>
                    <div className="space-y-2">
                      {savedItems.map(item => (
                        <Card
                          key={item.id}
                          className="cursor-pointer hover:bg-accent/50 transition-colors"
                          onClick={() => {
                            hydrateWorldbook(item.worldbook);
                            setFilename(item.title);
                            setCurrentItemId(item.id);
                          }}
                        >
                          <CardContent className="p-3 flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate text-foreground">{item.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {Object.keys(item.worldbook.entries).length} 个条目
                                <span className="mx-1">·</span>
                                <Clock className="w-3 h-3 inline -mt-0.5" />
                                {' '}{new Date(item.sourceModifiedAt ?? item.updatedAt).toLocaleString()}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              aria-label="删除"
                              onClick={(e) => { e.stopPropagation(); setDeleteTarget(item); }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Left: entries */}
              <div className="flex-1 min-w-0 md:border-r flex h-full min-h-0 flex-col">
                {/* 置顶筛选/搜索条：不随条目列表滚动，最多两行 */}
                <div className="shrink-0 border-b bg-card/60 backdrop-blur px-4 py-2 space-y-2">
                  {batchMode ? (
                    <BatchOperations
                      selectedKeys={batchSelected}
                      totalFiltered={filteredEntries.length}
                      onSelectAll={() => setBatchSelected(new Set(filteredEntries.map(([k]) => k)))}
                      onDeselectAll={() => setBatchSelected(new Set())}
                      onExitBatch={exitBatchMode}
                      onBatchPrefix={handleBatchPrefix}
                      onBatchDelete={handleBatchDelete}
                      onBatchPosition={handleBatchPosition}
                      onBatchStrategy={handleBatchStrategy}
                      onBatchEnable={handleBatchEnable}
                      copyTargets={savedItems.filter((i) => i.id !== currentItemId).map((i) => ({ id: i.id, title: i.title }))}
                      onBatchCopyTo={handleBatchCopyTo}
                    />
                  ) : (
                    <>
                      {/* 行1：搜索 + 排序 + 筛选 + 每页条数 + 视图切换 */}
                      <div className="flex gap-2 items-center flex-wrap">
                        <div className="relative w-56 max-w-full">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="搜索…"
                            className="h-8 pl-8 pr-7 text-sm"
                          />
                          {searchQuery && (
                            <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearchQuery('')}>
                              <X className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                          )}
                        </div>

                        <Select value={searchScope} onValueChange={(v) => setSearchScope(v as 'all' | 'title')}>
                          <SelectTrigger className="h-8 w-24 text-xs shrink-0" title="搜索范围">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">搜全部</SelectItem>
                            <SelectItem value="title">仅标题</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
                          <SelectTrigger className="h-8 w-28 text-xs shrink-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="order-asc">Order 升序</SelectItem>
                            <SelectItem value="order-desc">Order 降序</SelectItem>
                            <SelectItem value="title">标题排序</SelectItem>
                            <SelectItem value="uid">创建顺序</SelectItem>
                          </SelectContent>
                        </Select>

                        {/* 筛选 Popover */}
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant={activeFilterCount > 0 ? 'default' : 'outline'} size="sm" className="h-8 text-xs gap-1">
                              <SlidersHorizontal className="w-3.5 h-3.5" /> 筛选
                              {activeFilterCount > 0 && (
                                <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] leading-none">{activeFilterCount}</Badge>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64 p-3 space-y-3" align="start">
                            <div className="space-y-1.5">
                              <p className="text-xs font-medium text-muted-foreground">策略</p>
                              <div className="flex flex-wrap gap-1.5">
                                <Toggle size="sm" pressed={filterConstant} onPressedChange={setFilterConstant}
                                  className="h-7 text-xs px-2 data-[state=on]:bg-blue-500/20 data-[state=on]:text-blue-700">🔵 常驻</Toggle>
                                <Toggle size="sm" pressed={filterKeyword} onPressedChange={setFilterKeyword}
                                  className="h-7 text-xs px-2 data-[state=on]:bg-green-500/20 data-[state=on]:text-green-700">🟢 关键词</Toggle>
                                <Toggle size="sm" pressed={filterVector} onPressedChange={setFilterVector}
                                  className="h-7 text-xs px-2 data-[state=on]:bg-purple-500/20 data-[state=on]:text-purple-700">🔗 向量</Toggle>
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <p className="text-xs font-medium text-muted-foreground">状态</p>
                              <div className="flex flex-wrap gap-1.5">
                                <Toggle size="sm" pressed={filterEnabled} onPressedChange={setFilterEnabled} className="h-7 text-xs px-2">已启用</Toggle>
                                <Toggle size="sm" pressed={filterDisabled} onPressedChange={setFilterDisabled} className="h-7 text-xs px-2">已禁用</Toggle>
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <p className="text-xs font-medium text-muted-foreground">位置</p>
                              <Select value={filterPosition} onValueChange={setFilterPosition}>
                                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="位置" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">全部位置</SelectItem>
                                  {Object.entries(POSITION_LABELS).map(([k, v]) => (
                                    <SelectItem key={k} value={k}>{v}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            {hasFilters && (
                              <Button variant="ghost" size="sm" className="h-7 text-xs w-full" onClick={clearFilters}>
                                <X className="w-3 h-3 mr-1" /> 清除筛选
                              </Button>
                            )}
                          </PopoverContent>
                        </Popover>

                        <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                          <SelectTrigger className="h-8 w-24 text-xs shrink-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="25">25 / 页</SelectItem>
                            <SelectItem value="50">50 / 页</SelectItem>
                            <SelectItem value="100">100 / 页</SelectItem>
                            <SelectItem value="0">全部</SelectItem>
                          </SelectContent>
                        </Select>

                        <div className="flex-1" />
                        <div data-tour="wb-view-toggle" className="flex items-center gap-0">
                          <Button variant={viewMode === 'card' ? 'default' : 'ghost'} size="icon" className="h-7 w-7"
                            onClick={() => setViewMode('card')} aria-label="卡片视图">
                            <LayoutGrid className="w-4 h-4" />
                          </Button>
                          <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="icon" className="h-7 w-7"
                            onClick={() => setViewMode('list')} aria-label="列表视图">
                            <List className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {/* 行2：新增 / 批量 / 前缀归类 */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addEntry}>
                          <Plus className="w-3.5 h-3.5 mr-1" /> 新增
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs"
                          onClick={() => setBatchMode(true)} data-tour="wb-batch">
                          <CheckSquare className="w-3.5 h-3.5 mr-1" /> 批量
                        </Button>
                        <div data-tour="wb-prefix">
                          <PrefixCategorize entries={worldbook.entries} onApply={handlePrefixCategorize} />
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <ScrollArea className="flex-1 min-h-0">
                  <div className="p-4 space-y-3">
                    {viewMode === 'card' ? (
                      <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
                        {pagedEntries.map(([key, entry]) => (
                          <EntryCard
                            key={key}
                            entry={entry}
                            entryKey={key}
                            selected={selectedUid === key}
                            onClick={() => handleSelectEntry(key)}
                            onToggleEnabled={(v) => toggleEnabled(key, v)}
                            onDelete={() => deleteEntry(key)}
                            batchMode={batchMode}
                            batchChecked={batchSelected.has(key)}
                            onBatchToggle={(v, shift) => toggleBatchItem(key, v, shift)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="text-xs text-muted-foreground border-b">
                              {batchMode && <th className="px-2 py-1.5 w-8">选</th>}
                              <th className="px-2 py-1.5">启用</th>
                              <th className="px-2 py-1.5">策略</th>
                              <th className="px-2 py-1.5">标题</th>
                              <th className="px-2 py-1.5">关键词</th>
                              <th className="px-2 py-1.5">位置</th>
                              <th className="px-2 py-1.5 text-right">Order</th>
                              {!batchMode && <th className="px-2 py-1.5 w-8"></th>}
                            </tr>
                          </thead>
                          <tbody>
                            {pagedEntries.map(([key, entry]) => (
                              <EntryListRow
                                key={key}
                                entry={entry}
                                entryKey={key}
                                selected={selectedUid === key}
                                onClick={() => handleSelectEntry(key)}
                                onToggleEnabled={(v) => toggleEnabled(key, v)}
                                onDelete={() => deleteEntry(key)}
                                batchMode={batchMode}
                                batchChecked={batchSelected.has(key)}
                                onBatchToggle={(v, shift) => toggleBatchItem(key, v, shift)}
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {filteredEntries.length === 0 && hasFilters && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        没有匹配的条目，尝试调整筛选条件
                      </div>
                    )}

                    {/* 分页 */}
                    {pageSize > 0 && totalPages > 1 && (
                      <div className="flex items-center justify-center gap-3 pt-2 pb-4">
                        <Button variant="outline" size="sm" className="h-7 text-xs"
                          disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                          <ChevronLeft className="w-3.5 h-3.5 mr-0.5" /> 上一页
                        </Button>
                        <span className="text-xs text-muted-foreground">第 {page} / {totalPages} 页</span>
                        <Button variant="outline" size="sm" className="h-7 text-xs"
                          disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                          下一页 <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Right: desktop editor */}
              <div className="h-full min-h-0 w-[400px] shrink-0 hidden md:block border-l bg-card/50">
                {editorContent ? (
                  <ScrollArea className="h-full">
                    {editorContent}
                  </ScrollArea>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    点击左侧条目进行编辑
                  </div>
                )}
              </div>

              {/* Mobile: bottom sheet editor */}
              {isMobile && (
                <Sheet open={mobileEditorOpen && !!selectedEntry} onOpenChange={setMobileEditorOpen}>
                  <SheetContent side="bottom" className="h-[85vh] p-0">
                    <SheetHeader className="px-4 pt-4 pb-2">
                      <SheetTitle className="text-base">
                        编辑：{selectedEntry?.comment || '(无标题)'}
                      </SheetTitle>
                    </SheetHeader>
                    <ScrollArea className="h-[calc(85vh-3.5rem)]">
                      {editorContent}
                    </ScrollArea>
                  </SheetContent>
                </Sheet>
              )}
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
        onAppend={handleAppend}
      />
      </div>
    </AppLayout>
  );
}
