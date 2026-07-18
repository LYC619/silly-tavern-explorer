import { useEffect, useState, useCallback } from 'react';
import { Eye, RotateCcw, Trash2, Upload } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import type { ChatSession } from '@/types/chat';
import type { SummaryItem, SummaryKind } from '@/types/summary';
import { SUMMARY_KIND_LABELS } from '@/types/summary';
import { getAllSummaries, deleteSummary } from '@/lib/summary-db';
import { summaryToObsidian, downloadMarkdown } from '@/lib/obsidian-export';
import { MiniSummaryPanel } from './MiniSummaryPanel';

interface SavedSummaryListProps {
  /** 当前书 id，用于「仅当前书」筛选 */
  currentBookId: string | null;
  /** 刷新信号：父组件保存后 +1 触发重载 */
  refreshKey: number;
  /** 当前会话：「小总结」视图用（无会话时该视图给出提示） */
  session: ChatSession | null;
  /** 载入某条到编辑区 */
  onView: (item: SummaryItem) => void;
  /** 用 genParams 回填重新生成 */
  onRegenerate: (item: SummaryItem) => void;
  /** 列表内部删除后通知父组件（刷新前情分卷等派生数据） */
  onChanged?: () => void;
}

/** 筛选行的视图值：'mini' 不是总结类型，选中即切到小总结提取视图 */
type ViewFilter = SummaryKind | 'all' | 'mini';
const VIEW_FILTERS: ViewFilter[] = ['all', 'mini', 'volume', 'diary', 'diy'];

/** 右栏总控：一行筛选（当前书/全部 + 小总结/类型）+ 已存列表 或 小总结提取视图 */
export function SavedSummaryList({ currentBookId, refreshKey, session, onView, onRegenerate, onChanged }: SavedSummaryListProps) {
  const { toast } = useToast();
  const [all, setAll] = useState<SummaryItem[]>([]);
  const [scope, setScope] = useState<'book' | 'all'>('book');
  const [kindFilter, setKindFilter] = useState<ViewFilter>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const isMini = kindFilter === 'mini';

  const load = useCallback(() => {
    getAllSummaries().then(setAll).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const filtered = all.filter((s) => {
    if (scope === 'book' && currentBookId && s.bookId !== currentBookId) return false;
    if (kindFilter !== 'all' && kindFilter !== 'mini' && s.kind !== kindFilter) return false;
    return true;
  });

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteSummary(deleteId);
    setDeleteId(null);
    load();
    onChanged?.();
    toast({ title: '已删除' });
  };

  const handleExport = (item: SummaryItem) => {
    // Obsidian 友好 markdown（带 frontmatter），也可直接当普通 .md 用
    downloadMarkdown(item.title || SUMMARY_KIND_LABELS[item.kind], summaryToObsidian(item));
  };

  const handleExportAll = () => {
    if (filtered.length === 0) return;
    filtered.forEach((s) => downloadMarkdown(s.title || SUMMARY_KIND_LABELS[s.kind], summaryToObsidian(s)));
    toast({ title: `已导出 ${filtered.length} 份`, description: 'Obsidian 友好 markdown（含 frontmatter）' });
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {/* 筛选行 = 右栏总控。小总结视图下保持同一行结构不重排，仅灰置不适用的控件 */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className={`text-sm font-medium mr-1 ${isMini ? 'opacity-40' : ''}`}>共 {filtered.length} 条</span>
          <div className={isMini ? 'flex gap-1 opacity-40' : 'flex gap-1'}>
            <Button variant={scope === 'book' ? 'default' : 'ghost'} size="sm" className="h-6 px-2" disabled={isMini} onClick={() => setScope('book')}>当前书</Button>
            <Button variant={scope === 'all' ? 'default' : 'ghost'} size="sm" className="h-6 px-2" disabled={isMini} onClick={() => setScope('all')}>全部</Button>
          </div>
          <span className="text-muted-foreground">·</span>
          <div className="flex gap-1 flex-wrap">
            {VIEW_FILTERS.map((k) => (
              <Button
                key={k}
                variant={kindFilter === k ? 'default' : 'ghost'}
                size="sm"
                className="h-6 px-2"
                onClick={() => setKindFilter(k)}
              >
                {k === 'all' ? '全部类型' : k === 'mini' ? '小总结' : SUMMARY_KIND_LABELS[k]}
              </Button>
            ))}
          </div>
          {filtered.length > 0 && (
            <Button variant="outline" size="sm" className={`h-6 px-2 gap-1 ml-auto ${isMini ? 'opacity-40' : ''}`} disabled={isMini} onClick={handleExportAll}>
              <Upload className="w-3 h-3" />导出全部
            </Button>
          )}
        </div>

        {isMini ? (
          session ? (
            <MiniSummaryPanel session={session} />
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">载入聊天记录后才能提取小总结。</p>
          )
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">暂无总结</p>
        ) : (
          <div className="space-y-1.5">
            {filtered.map((s) => (
              <div key={s.id} className="flex items-center gap-2 p-2 rounded-md border hover:bg-accent/40 text-sm">
                <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">{SUMMARY_KIND_LABELS[s.kind]}</Badge>
                {s.volumeNumber != null && <span className="text-xs text-muted-foreground shrink-0">第{s.volumeNumber}卷</span>}
                <span className="truncate flex-1" title={s.title}>{s.title}</span>
                <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                  {s.floorStart}~{s.floorEnd}
                </span>
                {!s.autoSaved && <Badge variant="secondary" className="text-[10px] px-1 py-0 shrink-0">永久</Badge>}
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="查看/编辑" onClick={() => onView(s)}>
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="用相同设置重新生成" onClick={() => onRegenerate(s)}>
                    <RotateCcw className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="导出 .md" onClick={() => handleExport(s)}>
                    <Upload className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="删除" onClick={() => setDeleteId(s.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        {!isMini && (
          <p className="text-xs text-muted-foreground">
            标「永久」的是手动保存的；其余为自动暂存，仅保留最近若干份。点「查看」在下方展开编辑。
          </p>
        )}
      </CardContent>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
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
