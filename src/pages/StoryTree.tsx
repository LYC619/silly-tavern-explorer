import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Network, Plus, Trash2, ChevronsDownUp, ChevronsUpDown, Archive, Sparkles, Download, Wand2,
  Search, Upload, Undo2, Redo2, ListTree, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { HelpCard } from '@/components/HelpCard';
import { AppLayout } from '@/components/AppLayout';
import { GuidedTour } from '@/components/GuidedTour';
import { STORY_TREE_TOUR_STEPS, isTourCompleted, setTourCompleted } from '@/lib/tour-steps';
import { useToast } from '@/hooks/use-toast';
import { loadActiveSession, loadSessionPointer } from '@/lib/session-storage';
import type { ChatSession } from '@/types/chat';
import type { StoryTree as StoryTreeT, StoryNode } from '@/types/story-tree';
import { generateStoryTreeId } from '@/types/story-tree';
import {
  addNode, removeNode, updateNode, moveNode, toForest, findById, childrenOf,
  collectSubtreeIds, searchNodes,
} from '@/lib/story-tree-model';
import { storyTreeToJSON, parseStoryTreeJSON } from '@/lib/story-tree-io';
import {
  getAllStoryTrees, saveStoryTree, deleteStoryTree,
} from '@/lib/story-tree-db';
import { StoryTreeView, type DropZone } from '@/components/story-tree/StoryTreeView';
import { StoryMindmap } from '@/components/story-tree/StoryMindmap';
import { StoryNodeEditor } from '@/components/story-tree/StoryNodeEditor';
import { AIFillDialog } from '@/components/story-tree/AIFillDialog';
import { storyTreeToObsidian, downloadMarkdown } from '@/lib/obsidian-export';
import { demoStoryTree } from '@/components/DemoData';

/** 撤销栈上限：结构操作（增/删/移/AI 应用）才进栈，文本输入不进 */
const UNDO_LIMIT = 50;

function downloadJSON(name: string, content: string): void {
  const safe = name.replace(/[/\\:*?"<>|]/g, '_');
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safe.endsWith('.json') ? safe : `${safe}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const StoryTree = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [session, setSession] = useState<ChatSession | null>(null);
  const [bookId, setBookId] = useState<string | null>(null);

  const [trees, setTrees] = useState<StoryTreeT[]>([]);
  const [currentTreeId, setCurrentTreeId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<StoryNode[]>([]);
  const [treeTitle, setTreeTitle] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [deleteTreeOpen, setDeleteTreeOpen] = useState(false);
  const [aiFillOpen, setAiFillOpen] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<'tree' | 'mindmap'>('tree');

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 撤销/重做：仅结构操作进栈（存 nodes 快照），文本编辑不进；切树时清空
  const undoStack = useRef<StoryNode[][]>([]);
  const redoStack = useRef<StoryNode[][]>([]);
  const [, forceUpdate] = useState(0);
  const clearHistory = () => { undoStack.current = []; redoStack.current = []; };
  const pushHistory = (prev: StoryNode[]) => {
    undoStack.current.push(prev);
    if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift();
    redoStack.current = [];
  };

  // 初始加载：会话 + 该书的故事树列表
  useEffect(() => {
    const ptr = loadSessionPointer();
    setBookId(ptr?.currentBookId ?? null);
    loadActiveSession().then((s) => setSession(s));
    if (!isTourCompleted('story-tree')) {
      setTimeout(() => setShowTour(true), 500);
    }
  }, []);

  const reloadTrees = useCallback(async () => {
    const all = await getAllStoryTrees();
    const mine = bookId ? all.filter((t) => t.bookId === bookId) : all;
    setTrees(mine);
    return mine;
  }, [bookId]);

  useEffect(() => {
    reloadTrees().then((mine) => {
      if (mine.length && !currentTreeId) loadTree(mine[0]);
      // 首次引导且没有任何树：注入示例树保证引导锚点存在（纯内存，不落库）
      else if (!mine.length && !currentTreeId && !isTourCompleted('story-tree')) loadDemoTree();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadTrees]);

  const loadTree = (t: StoryTreeT) => {
    setCurrentTreeId(t.id);
    setNodes(t.nodes);
    setTreeTitle(t.title);
    setSelectedId(null);
    setQuery('');
    clearHistory();
  };

  // 示例树：纯内存注入（不写 IndexedDB），空态下保证引导锚点存在
  const loadDemoTree = () => {
    setIsDemo(true);
    setCurrentTreeId(demoStoryTree.id);
    setNodes(demoStoryTree.nodes);
    setTreeTitle(demoStoryTree.title);
    setSelectedId(demoStoryTree.nodes.find((n) => n.parentId !== null)?.id ?? null);
  };

  const exitDemo = async () => {
    setIsDemo(false);
    setCurrentTreeId(null);
    setNodes([]);
    setTreeTitle('');
    setSelectedId(null);
    const mine = await reloadTrees();
    if (mine.length) loadTree(mine[0]);
  };

  // 引导结束：示例树只为引导服务，结束后让位
  const handleTourEnd = () => {
    setTourCompleted('story-tree');
    setShowTour(false);
    if (isDemo) exitDemo();
  };

  // 防抖自动保存当前树
  const scheduleSave = useCallback((nextNodes: StoryNode[], nextTitle: string) => {
    if (!currentTreeId || isDemo) return; // 示例树只在内存，不落库
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const existing = trees.find((t) => t.id === currentTreeId);
      const item: StoryTreeT = {
        id: currentTreeId,
        bookId,
        bookTitle: session?.title ?? existing?.bookTitle ?? '(未命名)',
        title: nextTitle || '未命名故事树',
        nodes: nextNodes,
        createdAt: existing?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        autoSaved: false, // 手动新建的树默认永久
      };
      await saveStoryTree(item);
      reloadTrees();
    }, 600);
  }, [currentTreeId, isDemo, trees, bookId, session, reloadTrees]);

  const applyNodes = (next: StoryNode[]) => {
    setNodes(next);
    scheduleSave(next, treeTitle);
  };

  const handleCreateTree = async () => {
    setIsDemo(false); // 从示例切到真实树
    const item: StoryTreeT = {
      id: generateStoryTreeId(),
      bookId,
      bookTitle: session?.title ?? '(未命名)',
      title: session ? `${session.title} 的故事树` : '新故事树',
      nodes: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      autoSaved: false,
    };
    await saveStoryTree(item);
    await reloadTrees();
    loadTree(item);
    toast({ title: '已新建故事树' });
  };

  const handleDeleteTree = async () => {
    if (!currentTreeId) return;
    await deleteStoryTree(currentTreeId);
    setDeleteTreeOpen(false);
    setCurrentTreeId(null);
    setNodes([]);
    setSelectedId(null);
    const mine = await reloadTrees();
    if (mine.length) loadTree(mine[0]);
    toast({ title: '已删除故事树' });
  };

  const handleTitleChange = (v: string) => {
    setTreeTitle(v);
    scheduleSave(nodes, v);
  };

  const handleExportObsidian = () => {
    if (!currentTreeId) return;
    const existing = trees.find((t) => t.id === currentTreeId);
    const tree: StoryTreeT = {
      id: currentTreeId,
      bookId,
      bookTitle: session?.title ?? existing?.bookTitle ?? '(未命名)',
      title: treeTitle || '故事树',
      nodes,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    downloadMarkdown(tree.title, storyTreeToObsidian(tree, { linkNodes: false }));
    toast({ title: '已导出故事树', description: 'Obsidian 友好 markdown（含 frontmatter）' });
  };

  // 节点操作（结构变更先 pushHistory 再应用）
  const handleAddRoot = () => {
    const { nodes: next, node } = addNode(nodes, null, { title: '新节点' });
    pushHistory(nodes);
    applyNodes(next);
    setSelectedId(node.id);
  };
  const handleAddChild = (parentId: string) => {
    const { nodes: next, node } = addNode(nodes, parentId, { title: '新节点' });
    pushHistory(nodes);
    applyNodes(next);
    setCollapsed((c) => { const n = new Set(c); n.delete(parentId); return n; });
    setSelectedId(node.id);
  };
  const handleUpdateNode = (patch: Partial<StoryNode>) => {
    if (!selectedId) return;
    applyNodes(updateNode(nodes, selectedId, patch));
  };

  // 删除三选一：取消 / 改为归档（软删除，可恢复）/ 确认删除
  const [deleteNodeOpen, setDeleteNodeOpen] = useState(false);
  const deleteTargetCount = useMemo(
    () => (selectedId && deleteNodeOpen ? collectSubtreeIds(nodes, selectedId).length : 0),
    [selectedId, deleteNodeOpen, nodes]
  );
  const handleDeleteNode = () => {
    if (!selectedId) return;
    pushHistory(nodes);
    applyNodes(removeNode(nodes, selectedId));
    setSelectedId(null);
    setDeleteNodeOpen(false);
  };
  const handleArchiveInstead = () => {
    if (!selectedId) return;
    pushHistory(nodes);
    applyNodes(updateNode(nodes, selectedId, { archived: true }));
    setDeleteNodeOpen(false);
  };

  const handleMove = (draggedId: string, targetId: string | null, zone: DropZone) => {
    let next: StoryNode[];
    if (targetId === null) {
      // 拖到根级落点 = 移到顶层末尾
      next = moveNode(nodes, draggedId, null, childrenOf(nodes, null).length);
    } else if (zone === 'inside') {
      next = moveNode(nodes, draggedId, targetId, childrenOf(nodes, targetId).length);
    } else {
      const target = findById(nodes, targetId);
      if (!target) return;
      const sibs = childrenOf(nodes, target.parentId).filter((n) => n.id !== draggedId);
      const base = sibs.findIndex((s) => s.id === targetId);
      if (base < 0) return;
      next = moveNode(nodes, draggedId, target.parentId, zone === 'before' ? base : base + 1);
    }
    if (next === nodes) return; // model 拒绝的非法移动（如移到自己后代下）
    pushHistory(nodes);
    applyNodes(next);
  };
  const toggleCollapse = (id: string) => {
    setCollapsed((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  // 撤销/重做
  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(nodes);
    setNodes(prev);
    scheduleSave(prev, treeTitle);
    forceUpdate((n) => n + 1);
  }, [nodes, treeTitle, scheduleSave]);
  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(nodes);
    setNodes(next);
    scheduleSave(next, treeTitle);
    forceUpdate((n) => n + 1);
  }, [nodes, treeTitle, scheduleSave]);
  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y（输入框内不拦截）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (k === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // JSON 导入/导出
  const handleExportJSON = () => {
    if (!currentTreeId) return;
    const existing = trees.find((t) => t.id === currentTreeId);
    downloadJSON(treeTitle || '故事树', storyTreeToJSON({
      id: currentTreeId,
      bookId,
      bookTitle: session?.title ?? existing?.bookTitle ?? '(未命名)',
      title: treeTitle || '故事树',
      nodes,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    }));
    toast({ title: '已导出 JSON', description: '可用「导入」在任意设备恢复为新树' });
  };

  const handleImportJSON = async (file: File) => {
    const parsed = parseStoryTreeJSON(await file.text());
    if (parsed.ok !== true) {
      toast({ title: '导入失败', description: parsed.error, variant: 'destructive' });
      return;
    }
    const item: StoryTreeT = {
      id: generateStoryTreeId(),
      bookId,
      bookTitle: session?.title ?? '(未命名)',
      title: parsed.title,
      nodes: parsed.nodes,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      autoSaved: false,
    };
    await saveStoryTree(item);
    setIsDemo(false);
    await reloadTrees();
    loadTree(item);
    toast({ title: '已导入故事树', description: `${parsed.nodes.length} 个节点，已保存为新树` });
  };

  const forest = useMemo(() => toForest(nodes, showArchived), [nodes, showArchived]);
  const selectedNode = selectedId ? findById(nodes, selectedId) : undefined;
  const archivedCount = nodes.filter((n) => n.archived).length;

  // 搜索：命中行高亮、其余淡化；命中节点的祖先自动展开
  const searchResult = useMemo(() => searchNodes(nodes, query), [nodes, query]);
  const effectiveCollapsed = useMemo(() => {
    if (!searchResult) return collapsed;
    const n = new Set(collapsed);
    searchResult.expandIds.forEach((id) => n.delete(id));
    return n;
  }, [collapsed, searchResult]);

  const collapseAll = () => setCollapsed(new Set(nodes.filter((n) => childrenOf(nodes, n.id).length).map((n) => n.id)));
  const expandAll = () => setCollapsed(new Set());

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-5">
        <div className="max-w-7xl mx-auto space-y-4">
          {/* 头部：标题（左） + 未关联提示（右） */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg gold-gradient flex items-center justify-center shadow-card">
                <Network className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <h1 className="font-display text-xl font-semibold">故事树</h1>
                  <HelpCard>
                    用可视化事实树回顾多角色故事：人物、事件、关系、地点等节点手动整理，也可用 AI 从聊天楼层生成。节点可拖拽移动、归档（软删除）。每棵树关联当前书。
                  </HelpCard>
                </div>
                <p className="text-xs text-muted-foreground">回顾故事的记忆锚点</p>
              </div>
            </div>
            {!bookId && (
              <span className="text-xs text-muted-foreground pt-1">未关联书——建议先从聊天处理/书架打开一本书</span>
            )}
          </div>

          {/* 工具行：选树 + 重命名 + 操作（合并为一行，省纵向空间） */}
          <Card data-tour="story-tree-select">
            <CardContent className="p-3 flex items-center gap-2 flex-wrap">
              {isDemo ? (
                <Badge variant="outline" className="font-normal shrink-0">示例树 · 不会保存</Badge>
              ) : trees.length > 0 ? (
                <Select value={currentTreeId ?? ''} onValueChange={(v) => { const t = trees.find((x) => x.id === v); if (t) loadTree(t); }}>
                  <SelectTrigger className="h-8 w-52 shrink-0"><SelectValue placeholder="选择故事树" /></SelectTrigger>
                  <SelectContent>
                    {trees.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.title}（{t.nodes.length} 节点）</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm text-muted-foreground">还没有故事树</span>
              )}
              {currentTreeId && (
                <Input
                  value={treeTitle}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  className="h-8 flex-1 min-w-[160px]"
                  placeholder="故事树名称"
                />
              )}
              <div className="flex items-center gap-1 ml-auto">
                <Button variant="outline" size="sm" className="h-8 gap-1" onClick={handleCreateTree}>
                  <Plus className="w-4 h-4" />新建
                </Button>
                <label>
                  <Button variant="ghost" size="sm" className="h-8 gap-1" asChild>
                    <span><Upload className="w-4 h-4" />导入</span>
                  </Button>
                  <input type="file" accept=".json,application/json" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportJSON(f); e.target.value = ''; }} />
                </label>
                {currentTreeId && !isDemo && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 gap-1">
                        <Download className="w-4 h-4" />导出
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={handleExportJSON}>JSON（可再导入 / 分享）</DropdownMenuItem>
                      <DropdownMenuItem onSelect={handleExportObsidian}>Markdown（Obsidian 友好）</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {currentTreeId && !isDemo && (
                  <Button variant="ghost" size="sm" className="h-8 gap-1 text-destructive" onClick={() => setDeleteTreeOpen(true)}>
                    <Trash2 className="w-4 h-4" />删除
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {currentTreeId ? (
            <div className="flex flex-wrap gap-4 items-start">
              {/* 分栏不再用视口断点（sm:/md: 在用户环境反复失效）：flex-wrap + 行内 flex-basis，
                  容器放得下(230+270+gap)就 2:3 分栏，放不下自动换行；与视口/缩放/类覆盖解耦，同总结页 */}
              {/* 左：树视图（占 2/5，撑起工作区高度） */}
              <Card className="min-w-0" style={{ flex: '2 1 230px' }}>
                <CardContent className="p-3 space-y-2 min-h-[60vh]">
                  <div className="flex items-center gap-1 flex-wrap" data-tour="story-tree-toolbar">
                    <Button variant="outline" size="sm" className="h-7 gap-1" onClick={handleAddRoot}>
                      <Plus className="w-3.5 h-3.5" />根节点
                    </Button>
                    {session && (
                      <Button variant="outline" size="sm" className="h-7 gap-1" onClick={() => setAiFillOpen(true)}>
                        <Sparkles className="w-3.5 h-3.5" />AI 生成
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="撤销 (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
                      <Undo2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="重做 (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>
                      <Redo2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      title={viewMode === 'tree' ? '切换到导图视图' : '切换到树视图'}
                      onClick={() => setViewMode((m) => (m === 'tree' ? 'mindmap' : 'tree'))}
                    >
                      {viewMode === 'tree' ? <Network className="w-4 h-4" /> : <ListTree className="w-4 h-4" />}
                    </Button>
                    {viewMode === 'tree' && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="全部展开" onClick={expandAll}>
                          <ChevronsUpDown className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="全部折叠" onClick={collapseAll}>
                          <ChevronsDownUp className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    {archivedCount > 0 && (
                      <Button
                        variant={showArchived ? 'default' : 'ghost'}
                        size="sm"
                        className="h-7 gap-1 ml-auto"
                        onClick={() => setShowArchived((s) => !s)}
                      >
                        <Archive className="w-3.5 h-3.5" />归档 {archivedCount}
                      </Button>
                    )}
                  </div>

                  {nodes.length > 0 && (
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="搜索标题 / 提示 / 正文 / 标签"
                        className="h-7 pl-7 pr-7 text-xs"
                      />
                      {query && (
                        <button
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setQuery('')}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                  {searchResult && (
                    <p className="text-xs text-muted-foreground">命中 {searchResult.hitIds.size} 个节点</p>
                  )}

                  {nodes.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      空树。点「根节点」手动添加，或用「AI 生成」从聊天楼层提炼事实。
                    </p>
                  ) : viewMode === 'mindmap' ? (
                    <StoryMindmap forest={forest} selectedId={selectedId} onSelect={setSelectedId} />
                  ) : (
                    <StoryTreeView
                      forest={forest}
                      selectedId={selectedId}
                      collapsed={effectiveCollapsed}
                      showArchived={showArchived}
                      hitIds={searchResult ? searchResult.hitIds : null}
                      onSelect={setSelectedId}
                      onToggleCollapse={toggleCollapse}
                      onAddChild={handleAddChild}
                      onMove={handleMove}
                    />
                  )}
                </CardContent>
              </Card>

              {/* 右：节点编辑（占 3/5，sticky 跟随滚动） */}
              <div className="min-w-0 sm:sticky sm:top-4" style={{ flex: '3 1 270px' }}>
                <Card data-tour="story-tree-editor">
                  <CardContent className="p-4 min-h-[60vh]">
                    {selectedNode ? (
                      <StoryNodeEditor
                        key={selectedNode.id}
                        node={selectedNode}
                        onChange={handleUpdateNode}
                        onDelete={() => setDeleteNodeOpen(true)}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full min-h-[50vh]">
                        <p className="text-sm text-muted-foreground text-center">
                          点击左侧节点进行编辑；拖拽节点可移动到别的节点下。
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            trees.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center space-y-3">
                  <Network className="w-8 h-8 mx-auto text-muted-foreground" />
                  <p className="text-muted-foreground">用一棵事实树梳理这本书的人物、事件、关系。</p>
                  <div className="flex gap-2 justify-center flex-wrap">
                    <Button onClick={handleCreateTree} className="gap-1">
                      <Plus className="w-4 h-4" />新建故事树
                    </Button>
                    <Button variant="outline" className="gap-2" onClick={loadDemoTree}>
                      <Wand2 className="w-4 h-4" />加载示例
                    </Button>
                  </div>
                  {!session && (
                    <div className="flex gap-2 justify-center pt-2">
                      <Button variant="outline" size="sm" onClick={() => navigate('/')}>前往聊天处理</Button>
                      <Button variant="outline" size="sm" onClick={() => navigate('/bookshelf')}>打开书架</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          )}
        </div>
      </div>

      <AlertDialog open={deleteTreeOpen} onOpenChange={setDeleteTreeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除整棵故事树？</AlertDialogTitle>
            <AlertDialogDescription>此操作不可撤销，该树的所有节点将被永久删除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTree}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除节点：三选一，优先引导用归档（软删除，可恢复） */}
      <AlertDialog open={deleteNodeOpen} onOpenChange={setDeleteNodeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这个节点？</AlertDialogTitle>
            <AlertDialogDescription>
              将永久删除该节点{deleteTargetCount > 1 ? `及其 ${deleteTargetCount - 1} 个子节点` : ''}。
              建议改用「归档」——软删除、随时可在归档区恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button variant="outline" onClick={handleArchiveInstead}>
              <Archive className="w-4 h-4 mr-1.5" />改为归档
            </Button>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDeleteNode}>
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {session && currentTreeId && (
        <AIFillDialog
          open={aiFillOpen}
          onOpenChange={setAiFillOpen}
          session={session}
          nodes={nodes}
          onApply={(next) => { pushHistory(nodes); applyNodes(next); }}
        />
      )}

      {showTour && (
        <GuidedTour
          steps={STORY_TREE_TOUR_STEPS}
          module="story-tree"
          onComplete={handleTourEnd}
          onSkip={handleTourEnd}
        />
      )}
    </AppLayout>
  );
};

export default StoryTree;
