import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, RotateCcw, Trash2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { MiniSummaryPanel } from '@/components/summary/MiniSummaryPanel';
import { useToast } from '@/hooks/use-toast';
import { deleteSummary, getAllSummaries } from '@/lib/summary-db';
import { downloadMarkdown, summaryToObsidian } from '@/lib/obsidian-export';
import type { ChatSession } from '@/types/chat';
import { SUMMARY_KIND_LABELS, type SummaryItem, type SummaryKind } from '@/types/summary';

interface SavedSummaryListProps {
  currentBookId: string | null;
  refreshKey: number;
  session: ChatSession | null;
  onView: (item: SummaryItem) => void;
  onRegenerate: (item: SummaryItem) => void;
  onChanged?: () => void;
}

type ViewFilter = SummaryKind | 'all' | 'mini';
const VIEW_FILTERS: ViewFilter[] = ['all', 'mini', 'volume', 'diary', 'diy'];

export function SavedSummaryList({
  currentBookId,
  refreshKey,
  session,
  onView,
  onRegenerate,
  onChanged,
}: SavedSummaryListProps) {
  const { toast } = useToast();
  const [all, setAll] = useState<SummaryItem[]>([]);
  const [scope, setScope] = useState<'book' | 'all'>('book');
  const [kindFilter, setKindFilter] = useState<ViewFilter>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(() => {
    getAllSummaries().then(setAll).catch(() => setAll([]));
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const filtered = useMemo(() => all
    .filter((item) => {
      if (scope === 'book' && currentBookId && item.bookId !== currentBookId) return false;
      if (kindFilter !== 'all' && kindFilter !== 'mini' && item.kind !== kindFilter) return false;
      return true;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt), [all, currentBookId, kindFilter, scope]);

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteSummary(deleteId);
    setDeleteId(null);
    load();
    onChanged?.();
    toast({ title: '已删除' });
  };

  const handleExport = (item: SummaryItem) => {
    downloadMarkdown(item.title || SUMMARY_KIND_LABELS[item.kind], summaryToObsidian(item));
  };

  const handleExportAll = () => {
    filtered.forEach(handleExport);
    toast({ title: `已导出 ${filtered.length} 份`, description: 'Obsidian 友好 Markdown（含 frontmatter）' });
  };

  const isMini = kindFilter === 'mini';

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className={isMini ? 'text-sm font-medium mr-1 opacity-40' : 'text-sm font-medium mr-1'}>
            共 {filtered.length} 条
          </span>
          <div className={isMini ? 'flex gap-1 opacity-40' : 'flex gap-1'}>
            <Button variant={scope === 'book' ? 'default' : 'ghost'} size="sm" className="h-6 px-2" disabled={isMini} onClick={() => setScope('book')}>当前书</Button>
            <Button variant={scope === 'all' ? 'default' : 'ghost'} size="sm" className="h-6 px-2" disabled={isMini} onClick={() => setScope('all')}>全部</Button>
          </div>
          <span className="text-muted-foreground">·</span>
          <div className="flex gap-1 flex-wrap">
            {VIEW_FILTERS.map((filter) => (
              <Button
                key={filter}
                variant={kindFilter === filter ? 'default' : 'ghost'}
                size="sm"
                className="h-6 px-2"
                onClick={() => setKindFilter(filter)}
              >
                {filter === 'all' ? '全部类型' : filter === 'mini' ? '小总结' : SUMMARY_KIND_LABELS[filter]}
              </Button>
            ))}
          </div>
          {filtered.length > 0 && (
            <Button variant="outline" size="sm" className="h-6 px-2 gap-1 ml-auto" disabled={isMini} onClick={handleExportAll}>
              <Upload className="w-3 h-3" />导出全部
            </Button>
          )}
        </div>

        {isMini ? (
          session ? <MiniSummaryPanel session={session} /> : <p className="text-sm text-muted-foreground py-4 text-center">载入聊天记录后才能提取小总结。</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">暂无总结</p>
        ) : (
          <div className="space-y-1.5 max-h-[44vh] overflow-y-auto pr-1">
            {filtered.map((item) => (
              <div key={item.id} className="flex items-center gap-2 p-2 rounded-md border hover:bg-accent/40 text-sm">
                <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">{SUMMARY_KIND_LABELS[item.kind]}</Badge>
                {item.volumeNumber != null && <span className="text-xs text-muted-foreground shrink-0">第{item.volumeNumber}卷</span>}
                <span className="truncate flex-1" title={item.title}>{item.title || '（无标题）'}</span>
                <span className="text-xs text-muted-foreground shrink-0">{item.floorStart}~{item.floorEnd}</span>
                {!item.autoSaved && <Badge variant="secondary" className="text-[10px] px-1 py-0 shrink-0">永久</Badge>}
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="查看或编辑" onClick={() => onView(item)}><Eye className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="用相同设置重新生成" onClick={() => onRegenerate(item)}><RotateCcw className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="导出 Markdown" onClick={() => handleExport(item)}><Upload className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="删除" onClick={() => setDeleteId(item.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!isMini && <p className="text-xs text-muted-foreground">标“永久”的是手动保存记录；其他为自动暂存。点“查看”后在列表下方展开编辑。</p>}
      </CardContent>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这条总结？</AlertDialogTitle>
            <AlertDialogDescription>此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
