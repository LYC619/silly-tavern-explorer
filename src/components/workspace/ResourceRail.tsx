/**
 * 故事工作区右栏·资源栏（定稿 5.1 / task 2.5，可收起）。
 * 快速查看当前故事名下的总结/日记/故事树 + 按楼层范围快捷创建草稿；
 * 完整的生成与编辑在「整理与记录」界面，这里提供直达入口。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PanelRightClose, PanelRightOpen, Plus, NotebookText, Network, BookText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import type { ArchiveStory } from '@/types/archive';
import type { SummaryItem, SummaryKind } from '@/types/summary';
import type { StoryTree } from '@/types/story-tree';
import { generateSummaryId } from '@/types/summary';
import { getAllSummaries, saveSummary } from '@/lib/summary-db';
import { getAllStoryTrees } from '@/lib/story-tree-db';

interface ResourceRailProps {
  story: ArchiveStory;
  /** 当前脉络的楼层数（草稿范围上限） */
  floorCount: number;
  /** 跳到某楼（点记录的来源楼层时用） */
  onJumpToFloor: (floor: number) => void;
  /** 打开「整理与记录」并定位到某条目 */
  onOpenOrganize?: (target: { type: 'record' | 'tree'; id: string }) => void;
}

function formatWhen(ts: number): string {
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export function ResourceRail({ story, floorCount, onJumpToFloor, onOpenOrganize }: ResourceRailProps) {
  const { toast } = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const [summaries, setSummaries] = useState<SummaryItem[]>([]);
  const [trees, setTrees] = useState<StoryTree[]>([]);
  // 快捷创建草稿表单
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftKind, setDraftKind] = useState<SummaryKind>('volume');
  const [draftStart, setDraftStart] = useState('0');
  const [draftEnd, setDraftEnd] = useState('');

  const refresh = useCallback(async () => {
    const [allSums, allTrees] = await Promise.all([getAllSummaries(), getAllStoryTrees()]);
    setSummaries(allSums.filter((s) => s.bookId === story.id).sort((a, b) => b.updatedAt - a.updatedAt));
    setTrees(allTrees.filter((t) => t.bookId === story.id).sort((a, b) => b.updatedAt - a.updatedAt));
  }, [story.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const summaryItems = useMemo(() => summaries.filter((s) => s.kind !== 'diary'), [summaries]);
  const diaryItems = useMemo(() => summaries.filter((s) => s.kind === 'diary'), [summaries]);

  const handleCreateDraft = async () => {
    const start = Math.max(0, parseInt(draftStart, 10) || 0);
    const endRaw = parseInt(draftEnd, 10);
    const end = Number.isNaN(endRaw) ? Math.max(0, floorCount - 1) : Math.max(start, endRaw);
    const now = Date.now();
    const item: SummaryItem = {
      id: generateSummaryId(),
      bookId: story.id,
      bookTitle: story.title,
      kind: draftKind,
      title: `${draftKind === 'diary' ? '日记' : '总结'}草稿 #${start}-${end}`,
      floorStart: start,
      floorEnd: end,
      content: '',
      createdAt: now,
      updatedAt: now,
    };
    await saveSummary(item);
    setDraftOpen(false);
    await refresh();
    toast({
      title: '草稿已创建',
      description: '楼层范围已记下；到「整理与记录」界面生成与编辑。',
    });
    onOpenOrganize?.({ type: 'record', id: item.id });
  };

  if (collapsed) {
    return (
      <div className="w-9 shrink-0 pt-6">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={() => setCollapsed(false)}
          aria-label="展开资源栏"
          title="资源栏：总结 / 日记 / 故事树"
        >
          <PanelRightOpen className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  const section = (
    icon: React.ReactNode,
    label: string,
    items: SummaryItem[],
  ) => (
    <div>
      <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-1">
        {icon}
        {label}
        <span className="text-muted-foreground/60">({items.length})</span>
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">暂无</p>
      ) : (
        <div className="space-y-0.5">
          {items.slice(0, 8).map((s) => (
            <Collapsible key={s.id}>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm hover:bg-accent/60 transition-colors">
                  <span className="flex-1 min-w-0 truncate">{s.title}</span>
                  {!s.content && <Badge variant="outline" className="h-4 px-1 text-[10px] shrink-0">草稿</Badge>}
                  <span className="text-[10px] text-muted-foreground shrink-0">{formatWhen(s.updatedAt)}</span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mx-1.5 mb-1 rounded bg-muted/40 p-2 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      className="text-xs text-primary hover:underline"
                      onClick={() => onJumpToFloor(s.floorStart)}
                    >
                      来源 #{s.floorStart}–{s.floorEnd} 楼 · 跳过去
                    </button>
                    {onOpenOrganize && (
                      <button
                        className="text-xs text-primary hover:underline"
                        onClick={() => onOpenOrganize({ type: 'record', id: s.id })}
                      >
                        去整理与记录
                      </button>
                    )}
                  </div>
                  {s.content ? (
                    <div className="max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-foreground/85">
                      {s.content}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/70">还没有内容（到「整理与记录」生成）</p>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <aside className="w-64 shrink-0 grow-0 basis-64 space-y-4 pt-1">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">资源</p>
        <div className="flex items-center gap-1">
          <Popover open={draftOpen} onOpenChange={setDraftOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                <Plus className="w-3 h-3 mr-0.5" />
                建草稿
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 space-y-2" align="end">
              <p className="text-sm font-medium">按楼层范围建草稿</p>
              <Select value={draftKind} onValueChange={(v) => setDraftKind(v as SummaryKind)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="volume">分卷总结</SelectItem>
                  <SelectItem value="diary">角色日记</SelectItem>
                  <SelectItem value="diy">DIY 创作</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  value={draftStart}
                  onChange={(e) => setDraftStart(e.target.value)}
                  className="h-8 text-sm"
                  placeholder="起始楼"
                />
                <span className="text-muted-foreground text-xs shrink-0">到</span>
                <Input
                  type="number"
                  min={0}
                  value={draftEnd}
                  onChange={(e) => setDraftEnd(e.target.value)}
                  className="h-8 text-sm"
                  placeholder={`${Math.max(0, floorCount - 1)}`}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                只记范围先占位；AI 生成与编辑在「整理与记录」界面进行。
              </p>
              <Button size="sm" className="w-full" onClick={handleCreateDraft}>创建草稿</Button>
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={() => setCollapsed(true)}
            aria-label="收起资源栏"
          >
            <PanelRightClose className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {section(<BookText className="w-3.5 h-3.5" />, '总结', summaryItems)}
      {section(<NotebookText className="w-3.5 h-3.5" />, '日记', diaryItems)}

      <div>
        <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-1">
          <Network className="w-3.5 h-3.5" />
          故事树
          <span className="text-muted-foreground/60">({trees.length})</span>
        </p>
        {trees.length === 0 ? (
          <p className="text-xs text-muted-foreground/70">暂无</p>
        ) : (
          <div className="space-y-0.5">
            {trees.slice(0, 5).map((t) => (
              <button
                key={t.id}
                className="w-full flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-left hover:bg-accent/60 transition-colors"
                onClick={() => onOpenOrganize?.({ type: 'tree', id: t.id })}
                title="在「整理与记录」中打开"
              >
                <span className="flex-1 min-w-0 truncate">{t.title || '未命名故事树'}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{formatWhen(t.updatedAt)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground/70">
        这里只做快速查看与草稿占位；生成与完整编辑在左侧「整理与记录」界面。
      </p>
    </aside>
  );
}
