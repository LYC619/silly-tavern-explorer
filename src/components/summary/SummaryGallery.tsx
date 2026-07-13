import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Copy, Download, Pencil } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import type { SummaryItem, SummaryKind } from '@/types/summary';
import { SUMMARY_KIND_LABELS } from '@/types/summary';
import { getAllSummaries } from '@/lib/summary-db';
import { DiaryView } from './DiaryView';

interface SummaryGalleryProps {
  /** 当前书 id，用于「仅当前书」筛选 */
  currentBookId: string | null;
  /** 外部保存/删除后 +1 触发重载 */
  refreshKey: number;
  /** 角色名（日记本署名兜底） */
  charName?: string;
  /** 「去编辑」：切回工作台并载入该条 */
  onEdit?: (item: SummaryItem) => void;
}

type KindFilter = SummaryKind | 'all';
const FILTERS: KindFilter[] = ['all', 'volume', 'diary', 'diy'];

/**
 * 展示页：与生成工作台并列的纯阅读视图。
 * 左侧选条目（分卷按卷号升序排前，方便顺序阅读），右侧排版阅读——
 * 日记用日记本渲染，其余用纸张感衬线排版。后续总结/日记的美化都在这里做。
 */
export function SummaryGallery({ currentBookId, refreshKey, charName, onEdit }: SummaryGalleryProps) {
  const { toast } = useToast();
  const [all, setAll] = useState<SummaryItem[]>([]);
  const [scope, setScope] = useState<'book' | 'all'>('book');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => { getAllSummaries().then(setAll).catch(() => {}); }, [refreshKey]);

  const filtered = useMemo(() => {
    const list = all.filter((s) => {
      if (scope === 'book' && currentBookId && s.bookId !== currentBookId) return false;
      if (kindFilter !== 'all' && s.kind !== kindFilter) return false;
      return true;
    });
    // 阅读顺序：分卷按卷号升序排前，其余按更新时间倒序
    return [...list].sort((a, b) => {
      if (a.kind === 'volume' && b.kind === 'volume') return (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0);
      if (a.kind === 'volume') return -1;
      if (b.kind === 'volume') return 1;
      return b.updatedAt - a.updatedAt;
    });
  }, [all, scope, kindFilter, currentBookId]);

  const active = filtered.find((s) => s.id === activeId) ?? filtered[0];

  const handleCopy = async () => {
    if (!active) return;
    await navigator.clipboard.writeText(active.content);
    toast({ title: '已复制到剪贴板' });
  };

  const handleDownload = () => {
    if (!active) return;
    const safeName = (active.title || SUMMARY_KIND_LABELS[active.kind]).replace(/[\\/:*?"<>|]/g, '_');
    const blob = new Blob([active.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap gap-4 items-start">
      {/* 分栏同工作台：flex-wrap + 行内 flex-basis，不依赖视口断点（用户环境下 sm:/md: 反复失效） */}
      {/* 左：条目列表 */}
      <Card className="min-w-0" style={{ flex: '4 1 230px' }}>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center gap-1 flex-wrap text-xs">
            <Button variant={scope === 'book' ? 'default' : 'ghost'} size="sm" className="h-6 px-2" onClick={() => setScope('book')}>当前书</Button>
            <Button variant={scope === 'all' ? 'default' : 'ghost'} size="sm" className="h-6 px-2" onClick={() => setScope('all')}>全部</Button>
            <span className="text-muted-foreground">·</span>
            {FILTERS.map((k) => (
              <Button key={k} variant={kindFilter === k ? 'default' : 'ghost'} size="sm" className="h-6 px-2" onClick={() => setKindFilter(k)}>
                {k === 'all' ? '全部类型' : SUMMARY_KIND_LABELS[k]}
              </Button>
            ))}
          </div>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              暂无可展示的总结。先到「生成工作台」生成或手动添加。
            </p>
          ) : (
            <div className="space-y-1 max-h-[65vh] overflow-y-auto pr-0.5">
              {filtered.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveId(s.id)}
                  className={`w-full flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors ${
                    active?.id === s.id ? 'border-primary/60 bg-primary/5' : 'border-border hover:bg-accent/40'
                  }`}
                >
                  <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">{SUMMARY_KIND_LABELS[s.kind]}</Badge>
                  {s.volumeNumber != null && <span className="text-xs text-muted-foreground shrink-0">第{s.volumeNumber}卷</span>}
                  <span className="truncate flex-1">{s.title || '（无标题）'}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 右：阅读区 */}
      <Card className="min-w-0" style={{ flex: '8 1 270px' }}>
        <CardContent className="p-4 sm:p-6">
          {!active ? (
            <div className="flex items-center justify-center min-h-[40vh] text-sm text-muted-foreground">
              <BookOpen className="w-4 h-4 mr-2" />选择左侧一条总结开始阅读
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <h2 className="font-display text-xl font-semibold truncate">
                    {active.title || SUMMARY_KIND_LABELS[active.kind]}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {active.bookTitle} · 楼层 {active.floorStart}~{active.floorEnd} · {new Date(active.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={handleCopy}>
                    <Copy className="w-3.5 h-3.5" />复制
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={handleDownload}>
                    <Download className="w-3.5 h-3.5" />.md
                  </Button>
                  {onEdit && (
                    <Button variant="outline" size="sm" className="h-7 gap-1" onClick={() => onEdit(active)}>
                      <Pencil className="w-3.5 h-3.5" />去编辑
                    </Button>
                  )}
                </div>
              </div>
              {active.kind === 'diary' ? (
                <DiaryView content={active.content} charName={charName} />
              ) : (
                <div className="rounded-lg border paper-bg p-5 sm:p-6 font-serif text-[15px] leading-relaxed whitespace-pre-wrap">
                  {active.content}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
