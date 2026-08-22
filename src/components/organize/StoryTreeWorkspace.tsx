import { useCallback, useEffect, useState } from 'react';
import { Download, Network, Plus, Trash2, Upload } from 'lucide-react';
import { HelpCard } from '@/components/HelpCard';
import { TreeWorkbench } from '@/components/organize/TreeWorkbench';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { getBranchLine } from '@/lib/archive-db';
import { downloadMarkdown, storyTreeToObsidian } from '@/lib/obsidian-export';
import { routeTextFileExportResult } from '@/lib/text-file-export';
import { deleteStoryTree, getAllStoryTrees, saveStoryTree } from '@/lib/story-tree-db';
import { parseStoryTreeJSON, storyTreeToJSON } from '@/lib/story-tree-io';
import type { ArchiveStory } from '@/types/archive';
import { generateStoryTreeId, type StoryTree } from '@/types/story-tree';
import { LOADING_LABEL } from '@/lib/ui-copy';

interface StoryTreeWorkspaceProps {
  story: ArchiveStory;
  currentBranchId: string | null;
  initialTarget?: { type: 'record' | 'tree'; id: string };
}

function downloadJSON(name: string, content: string): void {
  const safeName = name.replace(/[/\\:*?"<>|]/g, '_');
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeName.endsWith('.json') ? safeName : `${safeName}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function StoryTreeWorkspace({ story, currentBranchId, initialTarget }: StoryTreeWorkspaceProps) {
  const { toast } = useToast();
  const [trees, setTrees] = useState<StoryTree[]>([]);
  const [currentTreeId, setCurrentTreeId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const currentLine = getBranchLine(story, currentBranchId) ?? getBranchLine(story, null)!;
  const currentTree = trees.find((tree) => tree.id === currentTreeId) ?? null;

  const reload = useCallback(async (preferredId?: string | null) => {
    const mine = (await getAllStoryTrees())
      .filter((tree) => tree.bookId === story.id)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    setTrees(mine);
    setCurrentTreeId((current) => {
      const target = preferredId ?? current;
      if (target && mine.some((tree) => tree.id === target)) return target;
      if (initialTarget?.type === 'tree' && mine.some((tree) => tree.id === initialTarget.id)) return initialTarget.id;
      return mine[0]?.id ?? null;
    });
    setLoaded(true);
  }, [initialTarget, story.id]);

  useEffect(() => { void reload(); }, [reload]);

  const createTree = async () => {
    const now = Date.now();
    const item: StoryTree = {
      id: generateStoryTreeId(), bookId: story.id, bookTitle: story.title,
      branchId: currentBranchId ?? undefined, title: `${story.title} 的故事树`, nodes: [],
      createdAt: now, updatedAt: now, autoSaved: false,
    };
    await saveStoryTree(item);
    await reload(item.id);
    toast({ title: '已新建故事树' });
  };

  const importTree = async (file: File) => {
    const parsed = parseStoryTreeJSON(await file.text());
    if (parsed.ok !== true) {
      toast({ title: '导入失败', description: parsed.error, variant: 'destructive' });
      return;
    }
    const now = Date.now();
    const item: StoryTree = {
      id: generateStoryTreeId(), bookId: story.id, bookTitle: story.title,
      branchId: currentBranchId ?? undefined, title: parsed.title, nodes: parsed.nodes,
      createdAt: now, updatedAt: now, autoSaved: false,
    };
    await saveStoryTree(item);
    await reload(item.id);
    toast({ title: '已导入故事树', description: `${item.nodes.length} 个节点` });
  };

  const deleteTree = async () => {
    if (!currentTree) return;
    await deleteStoryTree(currentTree.id);
    setDeleteOpen(false);
    await reload(null);
    toast({ title: '已删除故事树' });
  };

  const exportJSON = () => {
    if (!currentTree) return;
    downloadJSON(currentTree.title || '故事树', storyTreeToJSON(currentTree));
    toast({ title: '已导出 JSON' });
  };

  const exportMarkdown = async () => {
    if (!currentTree) return;
    const result = await downloadMarkdown(currentTree.title || '故事树', storyTreeToObsidian(currentTree));
    routeTextFileExportResult(result, {
      onComplete: () => toast({ title: '已导出 Markdown', description: 'Obsidian 友好（含 frontmatter）' }),
      onFailure: () => toast({ title: '导出失败', description: '没有写入任何文件，请重新选择位置后再试。', variant: 'destructive' }),
    });
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto container mx-auto px-4 py-5">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg gold-gradient flex items-center justify-center shadow-card"><Network className="w-5 h-5 text-primary-foreground" /></div>
            <div>
              <div className="flex items-center gap-1"><h1 className="font-display text-xl font-semibold">故事树</h1><HelpCard>用可视化事实树整理人物、事件、关系与地点；每棵树关联当前故事。</HelpCard></div>
              <p className="text-xs text-muted-foreground">回顾故事的记忆锚点</p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground text-right pt-1"><span className="font-medium text-foreground">{story.title}</span> · {currentLine.session.messages.length} 楼</div>
        </div>

        {currentTree ? (
          <TreeWorkbench
            key={currentTree.id}
            tree={currentTree}
            session={currentLine.session}
            onChanged={() => { void reload(currentTree.id); }}
            renderHeader={({ title, onTitleChange }) => (
              <Card data-story-tree-selector>
                <CardContent className="p-3 flex items-center gap-2 flex-wrap">
                  <Select value={currentTree.id} onValueChange={setCurrentTreeId}>
                    <SelectTrigger className="h-8 w-52 shrink-0"><SelectValue placeholder="选择故事树" /></SelectTrigger>
                    <SelectContent>{trees.map((item) => <SelectItem key={item.id} value={item.id}>{item.title}（{item.nodes.length} 节点）</SelectItem>)}</SelectContent>
                  </Select>
                  <Input value={title} onChange={(event) => onTitleChange(event.target.value)} className="h-8 flex-1 min-w-[160px]" placeholder="故事树名称" />
                  <div className="flex items-center gap-1 ml-auto">
                    <Button variant="outline" size="sm" className="h-8 gap-1" onClick={createTree}><Plus className="w-4 h-4" />新建</Button>
                    <label><Button variant="ghost" size="sm" className="h-8 gap-1" asChild><span><Download className="w-4 h-4" />导入</span></Button><input type="file" accept=".json,application/json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importTree(file); event.target.value = ''; }} /></label>
                    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="h-8 gap-1"><Upload className="w-4 h-4" />导出</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={exportJSON}>JSON（可再次导入）</DropdownMenuItem><DropdownMenuItem onSelect={exportMarkdown}>Markdown（Obsidian 友好）</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
                    <Button variant="ghost" size="sm" className="h-8 gap-1 text-destructive" onClick={() => setDeleteOpen(true)}><Trash2 className="w-4 h-4" />删除</Button>
                  </div>
                </CardContent>
              </Card>
            )}
          />
        ) : loaded ? (
          <Card data-story-tree-selector><CardContent className="p-8 text-center space-y-3"><Network className="w-8 h-8 mx-auto text-muted-foreground" /><p className="text-muted-foreground">用一棵事实树梳理这个故事的人物、事件与关系。</p><div className="flex gap-2 justify-center flex-wrap"><Button onClick={createTree} className="gap-1"><Plus className="w-4 h-4" />新建故事树</Button><label><Button variant="outline" className="gap-1" asChild><span><Download className="w-4 h-4" />导入</span></Button><input type="file" accept=".json,application/json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importTree(file); event.target.value = ''; }} /></label></div></CardContent></Card>
        ) : <div className="py-16 text-center text-sm text-muted-foreground">{LOADING_LABEL}</div>}
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除整棵故事树？</AlertDialogTitle><AlertDialogDescription>此操作不可撤销，该树的所有节点将被永久删除。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={deleteTree}>删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}
