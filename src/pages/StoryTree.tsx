import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Network, Plus, Trash2, ChevronsDownUp, ChevronsUpDown, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { HelpCard } from '@/components/HelpCard';
import { AppLayout } from '@/components/AppLayout';
import { useToast } from '@/hooks/use-toast';
import { loadActiveSession, loadSessionPointer } from '@/lib/session-storage';
import type { ChatSession } from '@/types/chat';
import type { StoryTree as StoryTreeT, StoryNode } from '@/types/story-tree';
import { generateStoryTreeId } from '@/types/story-tree';
import {
  addNode, removeNode, updateNode, moveNode, toForest, findById, childrenOf,
} from '@/lib/story-tree-model';
import {
  getAllStoryTrees, saveStoryTree, deleteStoryTree,
} from '@/lib/story-tree-db';
import { StoryTreeView } from '@/components/story-tree/StoryTreeView';
import { StoryNodeEditor } from '@/components/story-tree/StoryNodeEditor';

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

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 初始加载：会话 + 该书的故事树列表
  useEffect(() => {
    const ptr = loadSessionPointer();
    setBookId(ptr?.currentBookId ?? null);
    loadActiveSession().then((s) => setSession(s));
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
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadTrees]);

  const loadTree = (t: StoryTreeT) => {
    setCurrentTreeId(t.id);
    setNodes(t.nodes);
    setTreeTitle(t.title);
    setSelectedId(null);
  };

  // 防抖自动保存当前树
  const scheduleSave = useCallback((nextNodes: StoryNode[], nextTitle: string) => {
    if (!currentTreeId) return;
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
  }, [currentTreeId, trees, bookId, session, reloadTrees]);

  const applyNodes = (next: StoryNode[]) => {
    setNodes(next);
    scheduleSave(next, treeTitle);
  };

  const handleCreateTree = async () => {
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

  // 节点操作
  const handleAddRoot = () => {
    const { nodes: next, node } = addNode(nodes, null, { title: '新节点' });
    applyNodes(next);
    setSelectedId(node.id);
  };
  const handleAddChild = (parentId: string) => {
    const { nodes: next, node } = addNode(nodes, parentId, { title: '新节点' });
    applyNodes(next);
    setCollapsed((c) => { const n = new Set(c); n.delete(parentId); return n; });
    setSelectedId(node.id);
  };
  const handleUpdateNode = (patch: Partial<StoryNode>) => {
    if (!selectedId) return;
    applyNodes(updateNode(nodes, selectedId, patch));
  };
  const handleDeleteNode = () => {
    if (!selectedId) return;
    applyNodes(removeNode(nodes, selectedId));
    setSelectedId(null);
  };
  const handleMove = (draggedId: string, targetId: string, asChild: boolean) => {
    if (asChild) {
      // 放到目标节点下作为最后一个子节点
      const childCount = childrenOf(nodes, targetId).length;
      applyNodes(moveNode(nodes, draggedId, targetId, childCount));
    }
  };
  const toggleCollapse = (id: string) => {
    setCollapsed((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const forest = useMemo(() => toForest(nodes, showArchived), [nodes, showArchived]);
  const selectedNode = selectedId ? findById(nodes, selectedId) : undefined;
  const archivedCount = nodes.filter((n) => n.archived).length;

  const collapseAll = () => setCollapsed(new Set(nodes.filter((n) => childrenOf(nodes, n.id).length).map((n) => n.id)));
  const expandAll = () => setCollapsed(new Set());

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* 标题 */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg gold-gradient flex items-center justify-center shadow-card">
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

          {/* 树选择器 */}
          <Card>
            <CardContent className="p-4 flex items-center gap-2 flex-wrap">
              {trees.length > 0 ? (
                <Select value={currentTreeId ?? ''} onValueChange={(v) => { const t = trees.find((x) => x.id === v); if (t) loadTree(t); }}>
                  <SelectTrigger className="h-8 w-56"><SelectValue placeholder="选择故事树" /></SelectTrigger>
                  <SelectContent>
                    {trees.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.title}（{t.nodes.length} 节点）</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm text-muted-foreground">还没有故事树</span>
              )}
              <Button variant="outline" size="sm" className="h-8 gap-1" onClick={handleCreateTree}>
                <Plus className="w-4 h-4" />新建
              </Button>
              {currentTreeId && (
                <Button variant="ghost" size="sm" className="h-8 gap-1 text-destructive" onClick={() => setDeleteTreeOpen(true)}>
                  <Trash2 className="w-4 h-4" />删除此树
                </Button>
              )}
              {!bookId && (
                <span className="text-xs text-muted-foreground ml-auto">未关联书——建议先从聊天处理/书架打开一本书</span>
              )}
            </CardContent>
          </Card>

          {currentTreeId ? (
            <>
              <Input
                value={treeTitle}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="h-9 font-medium"
                placeholder="故事树名称"
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 左：树视图 */}
                <Card>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-1 flex-wrap">
                      <Button variant="outline" size="sm" className="h-7 gap-1" onClick={handleAddRoot}>
                        <Plus className="w-3.5 h-3.5" />根节点
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="全部展开" onClick={expandAll}>
                        <ChevronsUpDown className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="全部折叠" onClick={collapseAll}>
                        <ChevronsDownUp className="w-4 h-4" />
                      </Button>
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
                    {nodes.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">
                        空树。点「根节点」开始，或到聊天有内容时用 AI 从楼层生成（C3）。
                      </p>
                    ) : (
                      <StoryTreeView
                        forest={forest}
                        selectedId={selectedId}
                        collapsed={collapsed}
                        showArchived={showArchived}
                        onSelect={setSelectedId}
                        onToggleCollapse={toggleCollapse}
                        onAddChild={handleAddChild}
                        onMove={handleMove}
                      />
                    )}
                  </CardContent>
                </Card>

                {/* 右：节点编辑 */}
                <Card>
                  <CardContent className="p-4">
                    {selectedNode ? (
                      <StoryNodeEditor
                        node={selectedNode}
                        onChange={handleUpdateNode}
                        onDelete={handleDeleteNode}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground py-8 text-center">
                        点击左侧节点进行编辑；拖拽节点可移动到别的节点下。
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            trees.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center space-y-3">
                  <Network className="w-8 h-8 mx-auto text-muted-foreground" />
                  <p className="text-muted-foreground">用一棵事实树梳理这本书的人物、事件、关系。</p>
                  <Button onClick={handleCreateTree} className="gap-1">
                    <Plus className="w-4 h-4" />新建故事树
                  </Button>
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
    </AppLayout>
  );
};

export default StoryTree;
