import { useMemo } from 'react';
import { CalendarClock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { StoryNode } from '@/types/story-tree';
import { toForest } from '@/lib/story-tree-model';
import type { StoryNodeTree } from '@/types/story-tree';

interface StoryTimelineProps {
  nodes: StoryNode[];
  selectedId: string | null;
  hitIds: Set<string> | null;
  onSelect: (id: string) => void;
}

/** 按树的深度优先顺序摊平「事件」类节点（同参考项目按 order；我们无 createdAt，树序即叙事序） */
function flattenEvents(nodes: StoryNode[]): StoryNode[] {
  const out: StoryNode[] = [];
  const walk = (list: StoryNodeTree[]) => {
    for (const n of list) {
      if (n.type === 'event') out.push(n);
      walk(n.children);
    }
  };
  walk(toForest(nodes, false));
  return out;
}

/** 时间轴视图（移植自参考项目 timeline-view）：纵向时间线展示事件类节点 */
export function StoryTimeline({ nodes, selectedId, hitIds, onSelect }: StoryTimelineProps) {
  const events = useMemo(
    () => flattenEvents(nodes).filter((n) => !hitIds || hitIds.has(n.id)),
    [nodes, hitIds]
  );

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
        <CalendarClock className="w-8 h-8 opacity-40" />
        <p>还没有「事件」类型的节点</p>
        <p className="text-xs">在编辑器里把节点类型设为「事件」，或让 AI 生成时标注类型</p>
      </div>
    );
  }

  return (
    <ol className="relative flex flex-col gap-3 border-l border-border pl-5 ml-2 py-1">
      {events.map((event, i) => (
        <li key={event.id} className="relative">
          <span
            className={cn(
              'absolute -left-[26px] top-2 w-2.5 h-2.5 rounded-full border-2 border-background',
              selectedId === event.id ? 'bg-primary' : 'bg-rose-500'
            )}
            aria-hidden
          />
          <button
            type="button"
            onClick={() => onSelect(event.id)}
            className={cn(
              'flex w-full flex-col gap-1 rounded-lg border bg-card p-2.5 text-left transition-colors hover:bg-accent/50',
              selectedId === event.id && 'ring-1 ring-primary'
            )}
          >
            <span className="flex items-baseline gap-2 min-w-0">
              <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="text-sm font-medium truncate">{event.title || '(未命名)'}</span>
            </span>
            {event.hint && <span className="text-xs text-muted-foreground">{event.hint}</span>}
            {event.content && (
              <span className="line-clamp-4 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                {event.content}
              </span>
            )}
            {event.tags.length > 0 && (
              <span className="flex flex-wrap gap-1 pt-0.5">
                {event.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="px-1.5 py-0 text-[10px]">{tag}</Badge>
                ))}
              </span>
            )}
          </button>
        </li>
      ))}
    </ol>
  );
}
