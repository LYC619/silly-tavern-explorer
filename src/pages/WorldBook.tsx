import { useState, useCallback, useMemo, useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavigate } from 'react-router-dom';
import { Globe, LayoutGrid, List, Library, Moon, Sun, Plus, Trash2, Save, Search, X, CheckSquare, Clock, FolderOpen } from 'lucide-react';
import { PrefixCategorize } from '@/components/worldbook/PrefixCategorize';
import { BatchOperations } from '@/components/worldbook/BatchOperations';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toggle } from '@/components/ui/toggle';
import { Card, CardContent } from '@/components/ui/card';
import { WorldBookImporter } from '@/components/worldbook/WorldBookImporter';
import { WorldBookExporter } from '@/components/worldbook/WorldBookExporter';
import { EntryCard } from '@/components/worldbook/EntryCard';
import { EntryListRow } from '@/components/worldbook/EntryListRow';
import { EntryEditor } from '@/components/worldbook/EntryEditor';
import { QuickCreate } from '@/components/worldbook/QuickCreate';
import type { WorldBook, WorldBookEntry } from '@/types/worldbook';
import { DEFAULT_ENTRY, POSITION_LABELS, generateWorldBookId } from '@/types/worldbook';
import { saveWorldBook, getAllWorldBooks, deleteWorldBook } from '@/lib/worldbook-db';
import type { WorldBookItem } from '@/types/worldbook';
import { useToast } from '@/hooks/use-toast';

type SortMode = 'order-asc' | 'order-desc' | 'title' | 'uid';

export default function WorldBookPage() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const isMobile = useIsMobile();
  const { toast } = useToast();

  const [worldbook, setWorldbook] = useState<WorldBook | null>(null);
  const [filename, setFilename] = useState('worldbook');
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  const [savedItems, setSavedItems] = useState<WorldBookItem[]>([]);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'quick'>('edit');
  const [batchMode, setBatchMode] = useState(false);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterConstant, setFilterConstant] = useState(false);
  const [filterKeyword, setFilterKeyword] = useState(false);
  const [filterVector, setFilterVector] = useState(false);
  const [filterEnabled, setFilterEnabled] = useState(false);
  const [filterDisabled, setFilterDisabled] = useState(false);
  const [filterPosition, setFilterPosition] = useState<string>('all');
  const [sortMode, setSortMode] = useState<SortMode>('order-asc');

  const allEntries = worldbook ? Object.entries(worldbook.entries) : [];
  const selectedEntry = selectedUid && worldbook ? worldbook.entries[selectedUid] : null;

  const hasFilters = searchQuery || filterConstant || filterKeyword || filterVector || filterEnabled || filterDisabled || filterPosition !== 'all';

  // Auto-restore from IndexedDB on mount, or pick up AI-generated worldbook
  useEffect(() => {
    // Check for AI-generated worldbook import
    const aiImport = sessionStorage.getItem('ai-worldbook-import');
    if (aiImport) {
      sessionStorage.removeItem('ai-worldbook-import');
      try {
        const parsed = JSON.parse(aiImport);
        if (parsed && parsed.entries) {
          setWorldbook(parsed);
          setFilename('AI 提取的世界书');
          toast({ title: '已从 AI 工具导入世界书' });
          return;
        }
      } catch { /* ignore */ }
    }

    getAllWorldBooks().then(items => {
      setSavedItems(items);
      if (items.length > 0 && !worldbook) {
        const latest = items[0]; // already sorted by updatedAt desc
        setWorldbook(latest.worldbook);
        setFilename(latest.title);
        setCurrentItemId(latest.id);
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const filteredEntries = useMemo(() => {
    let result = allEntries;

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(([, e]) =>
        e.comment.toLowerCase().includes(q) ||
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
  }, [allEntries, searchQuery, filterConstant, filterKeyword, filterVector, filterEnabled, filterDisabled, filterPosition, sortMode]);

  const clearFilters = () => {
    setSearchQuery('');
    setFilterConstant(false);
    setFilterKeyword(false);
    setFilterVector(false);
    setFilterEnabled(false);
    setFilterDisabled(false);
    setFilterPosition('all');
  };

  const handleImport = useCallback((wb: WorldBook, name: string) => {
    setWorldbook(wb);
    setFilename(name);
    setSelectedUid(null);
    setCurrentItemId(null);
    setActiveTab('edit');
  }, []);

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
  }, [toast]);

  const updateEntry = useCallback((key: string, updated: WorldBookEntry) => {
    setWorldbook(prev => {
      if (!prev) return prev;
      return { ...prev, entries: { ...prev.entries, [key]: updated } };
    });
  }, []);

  const toggleEnabled = useCallback((key: string, enabled: boolean) => {
    setWorldbook(prev => {
      if (!prev) return prev;
      const entry = prev.entries[key];
      return { ...prev, entries: { ...prev.entries, [key]: { ...entry, enabled } } };
    });
  }, []);

  const addEntry = useCallback(() => {
    if (!worldbook) return;
    const maxUid = Object.values(worldbook.entries).reduce((max, e) => Math.max(max, e.uid), -1);
    const newUid = maxUid + 1;
    const key = String(newUid);
    const newEntry: WorldBookEntry = { ...DEFAULT_ENTRY, uid: newUid, comment: '新条目' } as WorldBookEntry;
    setWorldbook(prev => prev ? { ...prev, entries: { ...prev.entries, [key]: newEntry } } : prev);
    setSelectedUid(key);
    if (isMobile) setMobileEditorOpen(true);
  }, [worldbook]);

  const deleteEntry = useCallback((key: string) => {
    setWorldbook(prev => {
      if (!prev) return prev;
      const { [key]: _, ...rest } = prev.entries;
      return { ...prev, entries: rest };
    });
    if (selectedUid === key) {
      setSelectedUid(null);
      setMobileEditorOpen(false);
    }
  }, [selectedUid]);

  const handleSelectEntry = useCallback((key: string) => {
    setSelectedUid(key);
    if (isMobile) setMobileEditorOpen(true);
  }, [isMobile]);

  const handleSaveLocal = useCallback(async () => {
    if (!worldbook) return;
    const id = currentItemId || generateWorldBookId();
    const now = Date.now();
    const item: WorldBookItem = {
      id,
      title: filename,
      worldbook,
      createdAt: currentItemId ? (savedItems.find(s => s.id === id)?.createdAt ?? now) : now,
      updatedAt: now,
    };
    await saveWorldBook(item);
    setCurrentItemId(id);
    // Refresh saved items list
    const updated = await getAllWorldBooks();
    setSavedItems(updated);
    toast({ title: '已暂存', description: '已暂存到浏览器，刷新页面后可恢复' });
  }, [worldbook, filename, currentItemId, savedItems, toast]);

  const handleQuickAddEntries = useCallback((newEntries: WorldBookEntry[]) => {
    setWorldbook(prev => {
      if (!prev) {
        // Create new worldbook
        const entries: Record<string, WorldBookEntry> = {};
        newEntries.forEach((e, i) => { entries[String(i)] = e; });
        return { entries };
      }
      const maxKey = Math.max(-1, ...Object.keys(prev.entries).map(Number).filter(n => !isNaN(n)));
      const updated = { ...prev.entries };
      newEntries.forEach((e, i) => { updated[String(maxKey + 1 + i)] = e; });
      return { ...prev, entries: updated };
    });
    setActiveTab('edit');
    toast({ title: '已添加', description: `${newEntries.length} 个条目已添加到世界书` });
  }, [toast]);


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
  }, [toast]);

  // Batch mode
  const exitBatchMode = useCallback(() => {
    setBatchMode(false);
    setBatchSelected(new Set());
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && batchMode) exitBatchMode();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [batchMode, exitBatchMode]);

  const toggleBatchItem = useCallback((key: string, checked: boolean) => {
    setBatchSelected(prev => {
      const next = new Set(prev);
      checked ? next.add(key) : next.delete(key);
      return next;
    });
  }, []);

  const handleBatchPrefix = useCallback((prefix: string) => {
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
    toast({ title: '前缀已添加', description: `已为 ${batchSelected.size} 个条目添加前缀` });
  }, [batchSelected, toast]);

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
  }, [batchSelected, selectedUid, toast]);

  const handleBatchPosition = useCallback((position: number, depth?: number, role?: number) => {
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
    toast({ title: '位置已修改', description: `已修改 ${batchSelected.size} 个条目的插入位置` });
  }, [batchSelected, toast]);

  const handleBatchStrategy = useCallback((strategy: 'keyword' | 'constant' | 'vectorized') => {
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
    toast({ title: '策略已修改', description: `已修改 ${batchSelected.size} 个条目的触发策略` });
  }, [batchSelected, toast]);

  const handleBatchEnable = useCallback((enabled: boolean) => {
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
    toast({ title: enabled ? '已启用' : '已停用', description: `已${enabled ? '启用' : '停用'} ${batchSelected.size} 个条目` });
  }, [batchSelected, toast]);

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
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 h-14 flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          <h1 className="font-semibold text-foreground text-lg mr-2 hidden sm:block">世界书编辑器</h1>

          {/* Tab switcher */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'edit' | 'quick')} className="hidden sm:block">
            <TabsList className="h-8">
              <TabsTrigger value="edit" className="text-xs px-3 h-6">编辑模式</TabsTrigger>
              <TabsTrigger value="quick" className="text-xs px-3 h-6">快速创作</TabsTrigger>
            </TabsList>
          </Tabs>

          <Button variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? '日间模式' : '夜间模式'}>
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>

          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <Library className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">编辑器</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/bookshelf')}>
            <Library className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">书架</span>
          </Button>

          <div className="flex-1" />

          <WorldBookImporter onImport={handleImport} onAppend={handleAppend} hasExisting={!!worldbook} />

          {worldbook && activeTab === 'edit' && (
            <>
              <Button variant="outline" size="sm" onClick={addEntry} className="hidden sm:inline-flex">
                <Plus className="w-4 h-4 mr-1" /> 新增
              </Button>
              <Button variant="outline" size="icon" onClick={addEntry} className="h-8 w-8 sm:hidden">
                <Plus className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleSaveLocal} className="hidden sm:inline-flex">
                <Save className="w-4 h-4 mr-1" /> 暂存
              </Button>
              <WorldBookExporter worldbook={worldbook} filename={filename} />
              <PrefixCategorize entries={worldbook.entries} onApply={handlePrefixCategorize} />
              <Button variant={batchMode ? 'default' : 'outline'} size="sm" className="hidden sm:inline-flex"
                onClick={() => batchMode ? exitBatchMode() : setBatchMode(true)}>
                <CheckSquare className="w-4 h-4 mr-1" /> 批量
              </Button>
              <Button variant={batchMode ? 'default' : 'outline'} size="icon" className="h-8 w-8 sm:hidden"
                onClick={() => batchMode ? exitBatchMode() : setBatchMode(true)}>
                <CheckSquare className="w-4 h-4" />
              </Button>
              <div className="w-px h-6 bg-border mx-1 hidden sm:block" />

              <Button variant={viewMode === 'card' ? 'default' : 'ghost'} size="icon" className="h-8 w-8 hidden sm:inline-flex"
                onClick={() => setViewMode('card')}>
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="icon" className="h-8 w-8 hidden sm:inline-flex"
                onClick={() => setViewMode('list')}>
                <List className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>

        {/* Mobile tab switcher */}
        <div className="sm:hidden px-4 pb-2">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'edit' | 'quick')}>
            <TabsList className="w-full h-8">
              <TabsTrigger value="edit" className="text-xs flex-1 h-6">编辑模式</TabsTrigger>
              <TabsTrigger value="quick" className="text-xs flex-1 h-6">快速创作</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      {/* Body */}
      {activeTab === 'quick' ? (
        <ScrollArea className="flex-1">
          <QuickCreate
            existingWorldbook={worldbook}
            onAddToWorldbook={handleQuickAddEntries}
          />
        </ScrollArea>
      ) : (
        <div className="flex-1 flex overflow-hidden">
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
                            setWorldbook(item.worldbook);
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
                                {' '}{new Date(item.updatedAt).toLocaleString()}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteWorldBook(item.id).then(() => {
                                  setSavedItems(prev => prev.filter(s => s.id !== item.id));
                                  toast({ title: '已删除', description: `暂存「${item.title}」已删除` });
                                });
                              }}
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
              <div className="flex-1 min-w-0 md:border-r">
                <ScrollArea className="h-[calc(100vh-3.5rem)]">
                  <div className="p-4 space-y-3">
                    {/* Search + Sort row */}
                    <div className="flex gap-2 items-center">
                      <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="搜索标题、关键词、内容..."
                          className="h-8 pl-8 text-sm"
                        />
                        {searchQuery && (
                          <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearchQuery('')}>
                            <X className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                      <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
                        <SelectTrigger className="h-8 w-36 text-xs shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="order-asc">Order 升序</SelectItem>
                          <SelectItem value="order-desc">Order 降序</SelectItem>
                          <SelectItem value="title">标题排序</SelectItem>
                          <SelectItem value="uid">创建顺序</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Filters / Batch toolbar */}
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
                      />
                    ) : (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <Toggle size="sm" pressed={filterConstant} onPressedChange={setFilterConstant}
                          className="h-7 text-xs px-2 data-[state=on]:bg-blue-500/20 data-[state=on]:text-blue-700">
                          🔵 常驻
                        </Toggle>
                        <Toggle size="sm" pressed={filterKeyword} onPressedChange={setFilterKeyword}
                          className="h-7 text-xs px-2 data-[state=on]:bg-green-500/20 data-[state=on]:text-green-700">
                          🟢 关键词
                        </Toggle>
                        <Toggle size="sm" pressed={filterVector} onPressedChange={setFilterVector}
                          className="h-7 text-xs px-2 data-[state=on]:bg-purple-500/20 data-[state=on]:text-purple-700">
                          🔗 向量
                        </Toggle>
                        <div className="w-px h-5 bg-border" />
                        <Toggle size="sm" pressed={filterEnabled} onPressedChange={setFilterEnabled}
                          className="h-7 text-xs px-2">
                          已启用
                        </Toggle>
                        <Toggle size="sm" pressed={filterDisabled} onPressedChange={setFilterDisabled}
                          className="h-7 text-xs px-2">
                          已禁用
                        </Toggle>
                        <div className="w-px h-5 bg-border" />
                        <Select value={filterPosition} onValueChange={setFilterPosition}>
                          <SelectTrigger className="h-7 w-28 text-xs">
                            <SelectValue placeholder="位置" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">全部位置</SelectItem>
                            {Object.entries(POSITION_LABELS).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {hasFilters && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearFilters}>
                            <X className="w-3 h-3 mr-1" /> 清除
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Count */}
                    <p className="text-sm text-muted-foreground">
                      {hasFilters
                        ? `显示 ${filteredEntries.length} / 共 ${allEntries.length} 个条目 · ${filename}`
                        : `共 ${allEntries.length} 个条目 · ${filename}`}
                    </p>

                    {viewMode === 'card' ? (
                      <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
                        {filteredEntries.map(([key, entry]) => (
                          <EntryCard
                            key={key}
                            entry={entry}
                            selected={selectedUid === key}
                            onClick={() => handleSelectEntry(key)}
                            onToggleEnabled={(v) => toggleEnabled(key, v)}
                            batchMode={batchMode}
                            batchChecked={batchSelected.has(key)}
                            onBatchToggle={(v) => toggleBatchItem(key, v)}
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
                            </tr>
                          </thead>
                          <tbody>
                            {filteredEntries.map(([key, entry]) => (
                              <EntryListRow
                                key={key}
                                entry={entry}
                                selected={selectedUid === key}
                                onClick={() => handleSelectEntry(key)}
                                onToggleEnabled={(v) => toggleEnabled(key, v)}
                                batchMode={batchMode}
                                batchChecked={batchSelected.has(key)}
                                onBatchToggle={(v) => toggleBatchItem(key, v)}
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
                  </div>
                </ScrollArea>
              </div>

              {/* Right: desktop editor */}
              <div className="w-[400px] shrink-0 hidden md:block border-l bg-card/50">
                {editorContent ? (
                  <ScrollArea className="h-[calc(100vh-3.5rem)]">
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
    </div>
  );
}
