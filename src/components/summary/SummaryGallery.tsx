import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Copy, PanelLeftClose, PanelLeftOpen, Pencil, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DiaryView } from '@/components/summary/DiaryView';
import { MarkdownLite } from '@/components/MarkdownLite';
import { useToast } from '@/hooks/use-toast';
import { getAllSummaries } from '@/lib/summary-db';
import { exportTextFile } from '@/lib/text-file-export';
import { SUMMARY_KIND_LABELS, type SummaryItem, type SummaryKind } from '@/types/summary';

interface SummaryGalleryProps {
  currentBookId: string | null;
  refreshKey: number;
  kind: SummaryKind;
  charName?: string;
  onEdit?: (item: SummaryItem) => void;
}

export function SummaryGallery({ currentBookId, refreshKey, kind, charName, onEdit }: SummaryGalleryProps) {
  const { toast } = useToast();
  const [all, setAll] = useState<SummaryItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(true);

  useEffect(() => { getAllSummaries().then(setAll).catch(() => setAll([])); }, [refreshKey]);
  useEffect(() => { setActiveId(null); }, [currentBookId, kind]);

  const filtered = useMemo(() => all.filter((item) => {
    if (currentBookId && item.bookId !== currentBookId) return false;
    return item.kind === kind;
  }).sort((a, b) => {
    if (a.kind === 'volume' && b.kind === 'volume') return (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0);
    if (a.kind === 'volume') return -1;
    if (b.kind === 'volume') return 1;
    return b.updatedAt - a.updatedAt;
  }), [all, currentBookId, kind]);

  const active = filtered.find((item) => item.id === activeId) ?? filtered[0];

  const copyActive = async () => {
    if (!active) return;
    await navigator.clipboard.writeText(active.content);
    toast({ title: '已复制到剪贴板' });
  };

  const downloadActive = async () => {
    if (!active) return;
    const result = await exportTextFile({
      suggestedName: active.title || SUMMARY_KIND_LABELS[active.kind],
      content: active.content,
    });
    if (result === 'failed') toast({ title: '导出失败', variant: 'destructive' });
    else if (result !== 'cancelled') toast({ title: '导出完成' });
  };

  return (
    <div className="flex h-full min-h-0 gap-4 overflow-hidden">
      {listOpen && (
        <Card className="h-full min-w-0" style={{ flex: '3 1 210px' }}>
          <CardContent className="flex h-full min-h-0 flex-col gap-2 p-3">
            <div className="flex shrink-0 items-center justify-between gap-2 text-xs">
              <span className="font-medium">{SUMMARY_KIND_LABELS[kind]}</span>
              <span className="text-muted-foreground">共 {filtered.length} 条</span>
            </div>
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">暂无可展示的总结。先到“生成工作台”生成或手动添加。</p>
            ) : (
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
                {filtered.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveId(item.id)}
                    className={active?.id === item.id
                      ? 'w-full flex items-center gap-2 rounded-md border border-primary/60 bg-primary/5 px-2 py-1.5 text-left text-sm'
                      : 'w-full flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left text-sm hover:bg-accent/40'}
                  >
                    <Badge variant="outline" className="text-[11px] px-1 py-0 shrink-0">{SUMMARY_KIND_LABELS[item.kind]}</Badge>
                    {item.volumeNumber != null && <span className="text-xs text-muted-foreground shrink-0">第{item.volumeNumber}卷</span>}
                    <span className="truncate flex-1" title={item.title || '（无标题）'}>{item.title || '（无标题）'}</span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="h-full min-w-0" style={{ flex: '9 1 280px' }}>
        <CardContent className="h-full min-h-0 p-4 sm:p-6">
          {!active ? (
            <div className="flex items-center justify-center min-h-[40vh] text-sm text-muted-foreground"><BookOpen className="w-4 h-4 mr-2" />选择一条总结开始阅读</div>
          ) : (
            <div className="flex h-full min-h-0 flex-col gap-4">
              <div className="flex shrink-0 items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0 flex items-start gap-1.5">
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 mt-0.5" onClick={() => setListOpen((open) => !open)} title={listOpen ? '收起列表' : '展开列表'}>
                    {listOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
                  </Button>
                  <div className="min-w-0">
                    <h2 className="font-display text-xl font-semibold truncate" title={active.title || SUMMARY_KIND_LABELS[active.kind]}>{active.title || SUMMARY_KIND_LABELS[active.kind]}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">{active.bookTitle} · 楼层 {active.floorStart}~{active.floorEnd} · {new Date(active.updatedAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={copyActive}><Copy className="w-3.5 h-3.5" />复制</Button>
                  <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={() => void downloadActive()}><Upload className="w-3.5 h-3.5" />.md</Button>
                  {onEdit && <Button variant="outline" size="sm" className="h-7 gap-1" onClick={() => onEdit(active)}><Pencil className="w-3.5 h-3.5" />去编辑</Button>}
                </div>
              </div>
              <div data-summary-content-scroll className="min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-thin">
                {active.kind === 'diary' ? (
                  <DiaryView content={active.content} charName={charName} />
                ) : (
                  <MarkdownLite text={active.content} className="rounded-lg border paper-bg px-5 sm:px-8 py-6 font-serif text-[15px] max-w-[75ch] mx-auto" />
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
