/**
 * 故事树工作台（2.0 阶段3，从 pages/StoryTree.tsx 拆出的完整树编辑器）。
 * 只管一棵树的编辑：树/导图/卡片/时间轴视图、节点编辑、拖拽移动、撤销/重做、AI 生成。
 * 树列表的新建/删除/导入/导出在整理与记录的左栏与右栏（OrganizePanel/ContextRail）。
 * 父组件用 key={tree.id} 重挂来切树；保存防抖 600ms + 卸载兜底。
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Plus, ChevronsDownUp, ChevronsUpDown, Archive, Sparkles, Undo2, Redo2, Search, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { ChatSession } from '@/types/chat';
import type { StoryTree as StoryTreeT, StoryNode } from '@/types/story-tree';
import {
  addNode, removeNode, updateNode, moveNode, toForest, findById, childrenOf,
  collectSubtreeIds, searchNodes,
} from '@/lib/story-tree-model';
import { saveStoryTree } from '@/lib/story-tree-db';
import { StoryTreeView, type DropZone } from '@/components/story-tree/StoryTreeView';
import { StoryMindmap } from '@/components/story-tree/StoryMindmap';
import { StoryCardView } from '@/components/story-tree/StoryCardView';
import { StoryTimeline } from '@/components/story-tree/StoryTimeline';
import { StoryNodeEditor } from '@/components/story-tree/StoryNodeEditor';
import { AIFillDialog } from '@/components/story-tree/AIFillDialog';

/** 撤销栈上限：结构操作（增/删/移/AI 应用）才进栈，文本输入不进 */
const UNDO_LIMIT = 50;

interface TreeWorkbenchProps {
  tree: StoryTreeT;
  /** AI 生成用的会话（当前脉络）；null 时隐藏 AI 生成入口 */
  session: ChatSession | null;
  /** 保存落库后通知父组件刷新索引 */
  onChanged: () => void;
}

export function TreeWorkbench({ tree, session, onChanged }: TreeWorkbenchProps) {
  const [nodes, setNodes] = useState<StoryNode[]>(tree.nodes);
  const [treeTitle, setTreeTitle] = useState(tree.title);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [aiFillOpen, setAiFillOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<'tree' | 'mindmap' | 'cards' | 'timeline'>('tree');
  // 导图/时间轴内容自含全文，独占一整行；编辑器整行铺在下方（未选中不占位）
  const fullRowView = viewMode === 'mindmap' || viewMode === 'timeline';

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 卸载兜底用：闭包外读最新值
  const latestRef = useRef({ nodes: tree.nodes, title: tree.title, dirty: false });

  // 撤销/重做：仅结构操作进栈（存 nodes 快照），文本编辑不进
  const undoStack = useRef<StoryNode[][]>([]);
  const redoStack = useRef<StoryNode[][]>([]);
  const [, forceUpdate] = useState(0);
  const pushHistory = (prev: StoryNode[]) => {
    undoStack.current.push(prev);
    if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift();
    redoStack.current = [];
  };

  const buildItem = useCallback((nextNodes: StoryNode[], nextTitle: string): StoryTreeT => ({
    ...tree,
    title: nextTitle || '未命名故事树',
    nodes: nextNodes,
    updatedAt: Date.now(),
  }), [tree]);

  // 防抖自动保存
  const scheduleSave = useCallback((nextNodes: StoryNode[], nextTitle: string) => {
    latestRef.current = { nodes: nextNodes, title: nextTitle, dirty: true };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      latestRef.current.dirty = false;
      await saveStoryTree(buildItem(nextNodes, nextTitle));
      onChanged();
    }, 600);
  }, [buildItem, onChanged]);

  // 卸载兜底：防抖窗口内切走不丢最后一笔
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const { nodes: n, title: t, dirty } = latestRef.current;
    if (dirty) saveStoryTree(buildItem(n, t)).then(onChanged).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyNodes = (next: StoryNode[]) => {
    setNodes(next);
    scheduleSave(next, treeTitle);
  };

  const handleTitleChange = (v: string) => {
    setTreeTitle(v);
    scheduleSave(nodes, v);
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
    setCollapsed((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
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
      if (k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (k === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

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
    <div className="space-y-4">
      <Input
        value={treeTitle}
        onChange={(e) => handleTitleChange(e.target.value)}
        className="h-8"
        placeholder="故事树名称"
      />

      <div className="flex flex-wrap gap-4 items-start">
        {/* 布局铁律：flex-wrap + 行内 flex-basis，禁视口断点（同原故事树页） */}
        <Card className="min-w-0" style={{ flex: fullRowView ? '1 1 100%' : '2 1 230px' }}>
          <CardContent className="p-3 space-y-2 min-h-[60vh]">
            <div className="flex items-center gap-1 flex-wrap">
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
              <Select value={viewMode} onValueChange={(v) => setViewMode(v as typeof viewMode)}>
                <SelectTrigger className="h-7 w-[92px] text-xs" title="切换视图">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tree">树视图</SelectItem>
                  <SelectItem value="mindmap">导图</SelectItem>
                  <SelectItem value="cards">卡片</SelectItem>
                  <SelectItem value="timeline">时间轴</SelectItem>
                </SelectContent>
              </Select>
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
              <StoryMindmap forest={forest} selectedId={selectedId} onSelect={setSelectedId} title={treeTitle} />
            ) : viewMode === 'cards' ? (
              <StoryCardView
                nodes={nodes}
                selectedId={selectedId}
                hitIds={searchResult ? searchResult.hitIds : null}
                onSelect={setSelectedId}
              />
            ) : viewMode === 'timeline' ? (
              <div className="max-w-3xl mx-auto">
                <StoryTimeline
                  nodes={nodes}
                  selectedId={selectedId}
                  hitIds={searchResult ? searchResult.hitIds : null}
                  onSelect={setSelectedId}
                />
              </div>
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

        {/* 节点编辑（默认占 3/5 且 sticky；导图/时间轴模式整行铺在下方，未选中时不占位） */}
        {(!fullRowView || selectedNode) && (
          <div
            className={fullRowView ? 'min-w-0' : 'min-w-0 sm:sticky sm:top-4'}
            style={{ flex: fullRowView ? '1 1 100%' : '3 1 270px' }}
          >
            <Card>
              <CardContent className={fullRowView ? 'p-4' : 'p-4 min-h-[60vh]'}>
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
        )}
      </div>

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

      {session && (
        <AIFillDialog
          open={aiFillOpen}
          onOpenChange={setAiFillOpen}
          session={session}
          nodes={nodes}
          onApply={(next) => { pushHistory(nodes); applyNodes(next); }}
        />
      )}
    </div>
  );
}
