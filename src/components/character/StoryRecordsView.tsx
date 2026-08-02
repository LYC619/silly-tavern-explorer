/**
 * 角色页故事子视图：总结 / 日记 / 故事树 的查看视图（10.3b，C2）。
 * - 故事切换下拉 + 「去处理区生成」（工作区左上角已有返回按钮）+ 手动录入入口
 * - 条目展示「生成于 X · 覆盖 A-B 楼」（不做"已过期"判断——分卷增量总结会被误判，
 *   过没过期用户自己看）；手动录入的条目显示「手动录入」
 * - 未配 AI 时空态提示去 AI 工具页配置
 */
import { useState, useEffect, useMemo } from 'react';
import { ExternalLink, NotebookPen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { ArchiveStory } from '@/types/archive';
import type { SummaryItem, SummaryKind } from '@/types/summary';
import { generateSummaryId } from '@/types/summary';
import type { StoryTree, StoryNodeTree } from '@/types/story-tree';
import { NODE_TYPE_DOT } from '@/types/story-tree';
import { getAllSummaries, saveSummary } from '@/lib/summary-db';
import { getAllStoryTrees } from '@/lib/story-tree-db';
import { toForest } from '@/lib/story-tree-model';
import { loadAPIConfig } from '@/components/ai-tools';
import { formatFullTime, formatListTime } from '@/lib/time-display';

export type RecordViewKind = 'volume' | 'diary' | 'tree';

const KIND_LABELS: Record<RecordViewKind, string> = { volume: '总结', diary: '日记', tree: '故事树' };

interface StoryRecordsViewProps {
  stories: ArchiveStory[];
  kind: RecordViewKind;
  /** 去处理区生成：进入 /story/:id 对应整理子页面 */
  onGoGenerate: (storyId: string, kind: RecordViewKind) => void;
}

/** 树节点大纲（只读递归渲染） */
function TreeOutline({ nodes, depth = 0 }: { nodes: StoryNodeTree[]; depth?: number }) {
  return (
    <div className={cn(depth > 0 && 'ml-4 border-l border-border/60 pl-3')}>
      {nodes.map((n) => (
        <div key={n.id} className="py-0.5">
          <p className="text-sm flex items-center gap-1.5 min-w-0">
            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', NODE_TYPE_DOT[n.type ?? 'custom'])} />
            <span className="font-medium truncate">{n.title}</span>
            {n.hint && <span className="text-xs text-muted-foreground truncate">{n.hint}</span>}
          </p>
          {n.content && <p className="text-xs text-muted-foreground ml-3 whitespace-pre-wrap line-clamp-3">{n.content}</p>}
          {n.children.length > 0 && <TreeOutline nodes={n.children} depth={depth + 1} />}
        </div>
      ))}
    </div>
  );
}

export function StoryRecordsView({ stories, kind, onGoGenerate }: StoryRecordsViewProps) {
  const { toast } = useToast();
  const [storyId, setStoryId] = useState<string | null>(stories[0]?.id ?? null);
  const [summaries, setSummaries] = useState<SummaryItem[]>([]);
  const [trees, setTrees] = useState<StoryTree[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualContent, setManualContent] = useState('');
  const hasAI = !!loadAPIConfig().apiKey;

  const story = stories.find((s) => s.id === storyId) ?? null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!storyId) return;
      if (kind === 'tree') {
        const all = await getAllStoryTrees();
        if (!cancelled) setTrees(all.filter((t) => t.bookId === storyId));
      } else {
        const all = await getAllSummaries();
        if (!cancelled) {
          setSummaries(all
            .filter((s) => s.bookId === storyId && s.kind === (kind as SummaryKind))
            .sort((a, b) => b.updatedAt - a.updatedAt));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [storyId, kind, manualOpen]);

  const items = useMemo(() => (kind === 'tree' ? trees : summaries), [kind, trees, summaries]);

  const handleManualSave = async () => {
    if (!story || !manualContent.trim()) return;
    const now = Date.now();
    const item: SummaryItem = {
      id: generateSummaryId(),
      bookId: story.id,
      bookTitle: story.title,
      kind: kind as SummaryKind,
      title: manualTitle.trim() || `手动录入 · ${formatFullTime(now)}`,
      floorStart: 0,
      floorEnd: Math.max(story.session.messages.length - 1, 0),
      content: manualContent.trim(),
      createdAt: now,
      updatedAt: now,
    };
    await saveSummary(item);
    setManualOpen(false);
    setManualTitle('');
    setManualContent('');
    toast({ title: `已保存${KIND_LABELS[kind]}`, description: '手动录入的条目也可在处理区继续编辑' });
  };

  if (stories.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          还没有故事。先导入聊天记录，再来生成{KIND_LABELS[kind]}。
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* 工具行：故事切换 + 去处理区生成 + 手动录入 */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={storyId ?? undefined} onValueChange={setStoryId}>
          <SelectTrigger className="h-8 w-56 text-xs">
            <SelectValue placeholder="选择故事" />
          </SelectTrigger>
          <SelectContent>
            {stories.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {kind !== 'tree' && (
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setManualOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            手动录入
          </Button>
        )}
        {story && (
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onGoGenerate(story.id, kind)}>
            <ExternalLink className="w-3.5 h-3.5 mr-1" />
            去处理区生成
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-10 flex flex-col items-center gap-2 text-center">
            <NotebookPen className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">这个故事还没有{KIND_LABELS[kind]}</p>
            <p className="text-xs text-muted-foreground/70">
              {hasAI
                ? `点「去处理区生成」用 AI 生成${kind !== 'tree' ? '，或「手动录入」直接粘贴' : ''}`
                : '还没配置 AI：可先到「AI 工具」页配好 API，再回处理区生成' + (kind !== 'tree' ? '；也可以「手动录入」' : '')}
            </p>
          </CardContent>
        </Card>
      ) : kind === 'tree' ? (
        <div className="space-y-2">
          {trees.map((t) => (
            <Card key={t.id}>
              <CardContent className="py-3 px-4">
                <p className="text-sm font-medium flex items-center gap-2">
                  <span className="truncate">{t.title}</span>
                  <span className="text-xs text-muted-foreground font-normal shrink-0">
                    {t.nodes.length} 个节点 · 更新于{formatListTime(t.updatedAt)}
                  </span>
                </p>
                <div className="mt-2">
                  <TreeOutline nodes={toForest(t.nodes, false)} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {summaries.map((item) => {
            const manual = !item.genParams;
            const expanded = expandedId === item.id;
            return (
              <Card key={item.id} className="cursor-pointer" onClick={() => setExpandedId(expanded ? null : item.id)}>
                <CardContent className="py-3 px-4">
                  <p className="text-sm font-medium flex items-center gap-2 flex-wrap">
                    <span className="truncate">{item.title}</span>
                    {item.volumeNumber !== undefined && (
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal shrink-0">第 {item.volumeNumber} 卷</Badge>
                    )}
                  </p>
                  {/* 生成于 X · 覆盖 A-B 楼（不判断过期）；手动录入单独标 */}
                  <p className="text-xs text-muted-foreground mt-0.5" title={formatFullTime(item.updatedAt)}>
                    {manual ? '手动录入' : '生成'}于{formatListTime(item.updatedAt)}
                    {!manual && ` · 覆盖第 ${item.floorStart}-${item.floorEnd} 楼`}
                  </p>
                  <p className={cn('text-sm text-foreground/85 whitespace-pre-wrap mt-2', !expanded && 'line-clamp-4')}>
                    {item.content}
                  </p>
                  {!expanded && item.content.length > 160 && (
                    <p className="text-xs text-primary/80 mt-1">点击展开全文</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 手动录入弹窗 */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>手动录入{KIND_LABELS[kind]}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              placeholder="标题（留空自动按时间命名）"
            />
            <Textarea
              value={manualContent}
              onChange={(e) => setManualContent(e.target.value)}
              placeholder={`粘贴或输入${KIND_LABELS[kind]}正文…`}
              rows={10}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>取消</Button>
            <Button onClick={handleManualSave} disabled={!manualContent.trim()}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
