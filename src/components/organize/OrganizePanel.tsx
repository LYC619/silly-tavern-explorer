/**
 * 整理与记录（2.0 阶段3，定稿 5.2）：三栏 = 左资源索引 / 中预览编辑 / 右来源与操作。
 * 左栏统一列出本故事的分卷总结/角色日记/自定义记录(diy，显示模板名)/故事树，
 * 支持按类型/分支筛选与搜索；进入默认打开最近创建或修改的记录。
 * 中栏按资源切换：记录 → RecordWorkbench（MD 读写+生成流）；故事树 → TreeWorkbench。
 * 小总结提取（纯正则只读）挂在左栏底部入口。
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Plus, Search, NotebookText, ScanText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { ArchiveStory } from '@/types/archive';
import type { SummaryItem, SummaryKind } from '@/types/summary';
import type { StoryTree as StoryTreeT } from '@/types/story-tree';
import { SUMMARY_KIND_LABELS } from '@/types/summary';
import { generateStoryTreeId } from '@/types/story-tree';
import { getAllSummaries, saveSummary, deleteSummary } from '@/lib/summary-db';
import { getAllStoryTrees, saveStoryTree, deleteStoryTree } from '@/lib/story-tree-db';
import { getBranchLine } from '@/lib/archive-db';
import {
  buildOrganizeIndex, pickDefaultEntry, copyAsNewSummary, copyAsNewTree,
  type OrganizeFilter, type OrganizeKindFilter, type OrganizeEntry,
} from '@/lib/organize-index';
import { summaryToObsidian, storyTreeToObsidian, downloadMarkdown } from '@/lib/obsidian-export';
import { storyTreeToJSON, parseStoryTreeJSON } from '@/lib/story-tree-io';
import { RecordWorkbench, type RecordWorkbenchHandle } from './RecordWorkbench';
import { TreeWorkbench } from './TreeWorkbench';
import { ContextRail } from './ContextRail';
import { MiniSummaryPanel } from '@/components/summary/MiniSummaryPanel';

const KIND_FILTERS: { value: OrganizeKindFilter; label: string }[] = [
  { value: 'all', label: '全部类型' },
  { value: 'volume', label: '分卷总结' },
  { value: 'diary', label: '角色日记' },
  { value: 'diy', label: '自定义记录' },
  { value: 'tree', label: '故事树' },
];

type Selection =
  | { type: 'record'; id: string }
  | { type: 'tree'; id: string }
  | { type: 'new'; kind: SummaryKind; nonce: number }
  | { type: 'mini' }
  | null;

export interface OrganizeTarget {
  type: 'record' | 'tree';
  id: string;
}

interface OrganizePanelProps {
  story: ArchiveStory;
  characterName?: string;
  /** 工作区当前分支（新建记录的默认脉络 + 故事树 AI 生成用的会话） */
  currentBranchId: string | null;
  /** 从资源栏点进来时要打开的条目 */
  initialTarget?: OrganizeTarget | null;
  /** 跳回聊天：切分支（null=主线）+ 滚到楼层（由工作区切回阅读视图完成） */
  onJumpToChat: (branchId: string | null, floor: number) => void;
}

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

export function OrganizePanel({ story, characterName, currentBranchId, initialTarget, onJumpToChat }: OrganizePanelProps) {
  const { toast } = useToast();
  const [summaries, setSummaries] = useState<SummaryItem[]>([]);
  const [trees, setTrees] = useState<StoryTreeT[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<OrganizeFilter>({ kind: 'all', branch: 'all', query: '' });
  const [sel, setSel] = useState<Selection>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrganizeTarget | null>(null);
  const workbenchRef = useRef<RecordWorkbenchHandle>(null);
  const newNonce = useRef(0);

  const refresh = useCallback(async () => {
    const [allSums, allTrees] = await Promise.all([getAllSummaries(), getAllStoryTrees()]);
    setSummaries(allSums.filter((s) => s.bookId === story.id));
    setTrees(allTrees.filter((t) => t.bookId === story.id));
    setLoaded(true);
  }, [story.id]);

  useEffect(() => { refresh(); }, [refresh]);

  // 首次载入后定位：资源栏指定的条目优先，否则最近修改的一条
  useEffect(() => {
    if (!loaded || sel !== null) return;
    if (initialTarget) {
      setSel(initialTarget);
      return;
    }
    const def = pickDefaultEntry(buildOrganizeIndex(summaries, trees, { kind: 'all', branch: 'all', query: '' }));
    if (def) setSel({ type: def.type, id: def.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const entries = useMemo(() => buildOrganizeIndex(summaries, trees, filter), [summaries, trees, filter]);

  const selectedRecord = sel?.type === 'record' ? summaries.find((s) => s.id === sel.id) ?? null : null;
  const selectedTree = sel?.type === 'tree' ? trees.find((t) => t.id === sel.id) ?? null : null;
  // 故事树 AI 生成/小总结用当前工作区脉络的会话
  const workspaceLine = getBranchLine(story, currentBranchId) ?? getBranchLine(story, null)!;

  // ---- 新建 ----

  const handleNewRecord = (kind: SummaryKind) => {
    newNonce.current += 1;
    setSel({ type: 'new', kind, nonce: newNonce.current });
  };

  const handleNewTree = async () => {
    const item: StoryTreeT = {
      id: generateStoryTreeId(),
      bookId: story.id,
      bookTitle: story.title,
      title: `${story.title} 的故事树`,
      nodes: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      autoSaved: false,
    };
    await saveStoryTree(item);
    await refresh();
    setSel({ type: 'tree', id: item.id });
    toast({ title: '已新建故事树' });
  };

  const handleImportTree = async (file: File) => {
    const parsed = parseStoryTreeJSON(await file.text());
    if (parsed.ok !== true) {
      toast({ title: '导入失败', description: parsed.error, variant: 'destructive' });
      return;
    }
    const item: StoryTreeT = {
      id: generateStoryTreeId(),
      bookId: story.id,
      bookTitle: story.title,
      title: parsed.title,
      nodes: parsed.nodes,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      autoSaved: false,
    };
    await saveStoryTree(item);
    await refresh();
    setSel({ type: 'tree', id: item.id });
    toast({ title: '已导入故事树', description: `${parsed.nodes.length} 个节点，已保存为新树` });
  };

  // ---- 右栏操作 ----

  const handleCopy = async () => {
    if (selectedRecord) {
      const copy = copyAsNewSummary(selectedRecord);
      await saveSummary(copy);
      await refresh();
      setSel({ type: 'record', id: copy.id });
      toast({ title: '已复制为新记录', description: copy.title });
    } else if (selectedTree) {
      const copy = copyAsNewTree(selectedTree);
      await saveStoryTree(copy);
      await refresh();
      setSel({ type: 'tree', id: copy.id });
      toast({ title: '已复制为新树', description: copy.title });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'record') await deleteSummary(deleteTarget.id);
    else await deleteStoryTree(deleteTarget.id);
    setDeleteTarget(null);
    setSel(null); // 触发重新定位默认条目
    await refresh();
    toast({ title: '已删除' });
  };

  const handleExportMd = () => {
    if (selectedRecord) {
      downloadMarkdown(selectedRecord.title || SUMMARY_KIND_LABELS[selectedRecord.kind], summaryToObsidian(selectedRecord));
    } else if (selectedTree) {
      downloadMarkdown(selectedTree.title || '故事树', storyTreeToObsidian(selectedTree, { linkNodes: false }));
    }
    toast({ title: '已导出 Markdown', description: 'Obsidian 友好（含 frontmatter）' });
  };

  const handleExportTreeJson = () => {
    if (!selectedTree) return;
    downloadJSON(selectedTree.title || '故事树', storyTreeToJSON(selectedTree));
    toast({ title: '已导出 JSON', description: '可用「新建▾导入」在任意设备恢复为新树' });
  };

  // 记录保存后：刷新索引并把选中切到已存条目（新建→首存后落位）
  const handleRecordSaved = useCallback(async (item: SummaryItem) => {
    await refresh();
    setSel((cur) => (cur?.type === 'record' && cur.id === item.id ? cur : { type: 'record', id: item.id }));
  }, [refresh]);

  const branchNameOf = (id?: string) => (id ? story.branches?.find((b) => b.id === id)?.name : undefined);

  const renderEntry = (e: OrganizeEntry) => {
    const active = (sel?.type === 'record' || sel?.type === 'tree') && sel.id === e.id;
    const branchName = branchNameOf(e.branchId);
    return (
      <button
        key={`${e.type}-${e.id}`}
        onClick={() => setSel({ type: e.type, id: e.id })}
        className={cn(
          'w-full rounded-md border px-2 py-1.5 text-left text-sm transition-colors space-y-0.5',
          active ? 'border-primary/60 bg-primary/5' : 'border-border hover:bg-accent/40',
        )}
      >
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0 max-w-[9rem] truncate">{e.kindLabel}</Badge>
          {e.volumeNumber != null && <span className="text-xs text-muted-foreground shrink-0">第{e.volumeNumber}卷</span>}
          <span className="truncate flex-1 min-w-0" title={e.title}>{e.title}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {e.type === 'record' && <span>#{e.floorStart}–{e.floorEnd}</span>}
          {branchName && <span className="truncate max-w-[7rem]">{branchName}</span>}
          {e.draft && <Badge variant="outline" className="h-4 px-1 text-[10px]">草稿</Badge>}
          {e.type === 'record' && !e.draft && !e.autoSaved && <Badge variant="secondary" className="h-4 px-1 text-[10px]">永久</Badge>}
          <span className="ml-auto shrink-0">
            {new Date(e.updatedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className="flex items-start flex-wrap gap-4 px-4 py-4">
      {/* 布局铁律：flex-wrap + 行内 flex-basis，禁视口断点 */}
      {/* ===== 左栏：资源索引 ===== */}
      <aside className="min-w-0 space-y-2" style={{ flex: '0 1 16rem', minWidth: '13rem' }}>
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium flex-1">资源索引</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-7 gap-1 px-2">
                <Plus className="w-3.5 h-3.5" />新建
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => handleNewRecord('volume')}>分卷总结</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleNewRecord('diary')}>角色日记</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleNewRecord('diy')}>自定义记录（DIY）</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleNewTree}>故事树</DropdownMenuItem>
              <DropdownMenuItem onSelect={(e) => {
                e.preventDefault();
                document.getElementById('organize-tree-import')?.click();
              }}>
                导入故事树 JSON…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            id="organize-tree-import"
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportTree(f); e.target.value = ''; }}
          />
        </div>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={filter.query}
            onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
            placeholder="搜索标题 / 模板名"
            className="h-7 pl-7 text-xs"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Select value={filter.kind} onValueChange={(v) => setFilter((f) => ({ ...f, kind: v as OrganizeKindFilter }))}>
            <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {KIND_FILTERS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {(story.branches?.length ?? 0) > 0 && (
            <Select value={filter.branch} onValueChange={(v) => setFilter((f) => ({ ...f, branch: v }))}>
              <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部脉络</SelectItem>
                <SelectItem value="main">主线</SelectItem>
                {(story.branches ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">
            {loaded ? '暂无记录。点「新建」开始，或在阅读界面选楼层范围建草稿。' : '加载中…'}
          </p>
        ) : (
          <div className="space-y-1 max-h-[70vh] overflow-y-auto pr-0.5">
            {entries.map(renderEntry)}
          </div>
        )}

        <Button
          variant={sel?.type === 'mini' ? 'default' : 'ghost'}
          size="sm"
          className="h-7 gap-1 w-full justify-start text-xs"
          onClick={() => setSel({ type: 'mini' })}
          title="用正则从聊天里提取每楼 AI 自带的小结（只读，不调 AI）"
        >
          <ScanText className="w-3.5 h-3.5" />小总结提取
        </Button>
      </aside>

      {/* ===== 中栏：预览编辑 ===== */}
      <main className="min-w-0" style={{ flex: '1 1 26rem' }}>
        {sel?.type === 'new' && (
          <RecordWorkbench
            key={`new-${sel.kind}-${sel.nonce}`}
            ref={workbenchRef}
            story={story}
            kind={sel.kind}
            record={null}
            defaultBranchId={currentBranchId}
            onSaved={handleRecordSaved}
          />
        )}
        {selectedRecord && (
          <RecordWorkbench
            key={selectedRecord.id}
            ref={workbenchRef}
            story={story}
            kind={selectedRecord.kind}
            record={selectedRecord}
            defaultBranchId={currentBranchId}
            onSaved={handleRecordSaved}
          />
        )}
        {selectedTree && (
          <TreeWorkbench
            key={selectedTree.id}
            tree={selectedTree}
            session={workspaceLine.session}
            onChanged={refresh}
          />
        )}
        {sel?.type === 'mini' && (
          <Card>
            <CardContent className="p-4">
              <MiniSummaryPanel session={workspaceLine.session} />
            </CardContent>
          </Card>
        )}
        {(sel === null || (sel.type === 'record' && !selectedRecord) || (sel.type === 'tree' && !selectedTree)) && loaded && (
          <Card>
            <CardContent className="py-16 text-center space-y-2">
              <NotebookText className="w-8 h-8 mx-auto text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">
                左侧选择一条记录，或点「新建」生成总结 / 日记 / 自定义记录 / 故事树。
              </p>
            </CardContent>
          </Card>
        )}
      </main>

      {/* ===== 右栏：来源与操作 ===== */}
      {(selectedRecord || selectedTree) && (
        <aside className="min-w-0" style={{ flex: '0 1 15rem', minWidth: '12rem' }}>
          <ContextRail
            story={story}
            characterName={characterName}
            selection={selectedRecord ? { type: 'record', item: selectedRecord } : { type: 'tree', tree: selectedTree! }}
            onJumpToChat={onJumpToChat}
            onRegenerate={selectedRecord ? () => workbenchRef.current?.regenerate() : undefined}
            onCopy={handleCopy}
            onDelete={() => setDeleteTarget(selectedRecord
              ? { type: 'record', id: selectedRecord.id }
              : { type: 'tree', id: selectedTree!.id })}
            onExportMd={handleExportMd}
            onExportJson={selectedTree ? handleExportTreeJson : undefined}
          />
        </aside>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTarget?.type === 'tree' ? '删除整棵故事树？' : '删除这条记录？'}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === 'tree' ? '此操作不可撤销，该树的所有节点将被永久删除。' : '此操作不可撤销。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
