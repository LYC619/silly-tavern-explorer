import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { StoryNode, StoryNodeType } from '@/types/story-tree';
import { NODE_TYPE_LABELS, NODE_TYPE_BORDER } from '@/types/story-tree';

/** 卡片视图分组顺序：分类节点是结构容器不单独展示，未分类兜底放最后（兼容老数据） */
const GROUP_ORDER: (StoryNodeType | 'none')[] = ['character', 'location', 'item', 'event', 'custom', 'none'];

interface StoryCardViewProps {
  nodes: StoryNode[];
  selectedId: string | null;
  /** 搜索命中集合；null=未在搜索 */
  hitIds: Set<string> | null;
  onSelect: (id: string) => void;
}

/** 卡片视图（移植自参考项目 card-view）：按类型分组平铺，适合快速浏览角色/地点/物品设定 */
export function StoryCardView({ nodes, selectedId, hitIds, onSelect }: StoryCardViewProps) {
  const groups = useMemo(() => {
    const map = new Map<StoryNodeType | 'none', StoryNode[]>();
    for (const node of nodes) {
      if (node.archived || node.type === 'category') continue;
      if (hitIds && !hitIds.has(node.id)) continue;
      const key = node.type ?? 'none';
      const list = map.get(key);
      if (list) list.push(node);
      else map.set(key, [node]);
    }
    return GROUP_ORDER.filter((t) => map.has(t)).map((t) => ({
      type: t,
      items: (map.get(t) ?? []).sort((a, b) => a.order - b.order),
    }));
  }, [nodes, hitIds]);

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">没有可显示的节点</p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.type}>
          <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">
            {group.type === 'none' ? '未分类' : NODE_TYPE_LABELS[group.type]}（{group.items.length}）
          </h3>
          {/* 分栏铁律：不用视口断点，flex-wrap + 行内 basis 自适应 */}
          <div className="flex flex-wrap gap-2">
            {group.items.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => onSelect(node.id)}
                style={{ flex: '1 1 180px' }}
                className={cn(
                  'flex flex-col gap-1 rounded-lg border bg-card p-2.5 text-left transition-colors hover:bg-accent/50 min-w-0',
                  group.type !== 'none' && `border-l-2 ${NODE_TYPE_BORDER[group.type]}`,
                  selectedId === node.id && 'ring-1 ring-primary'
                )}
              >
                <span className="text-sm font-medium truncate">{node.title || '(未命名)'}</span>
                {node.hint && <span className="text-xs text-muted-foreground truncate">{node.hint}</span>}
                {node.content && (
                  <span className="line-clamp-3 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                    {node.content}
                  </span>
                )}
                {node.tags.length > 0 && (
                  <span className="flex flex-wrap gap-1 pt-0.5">
                    {node.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="px-1.5 py-0 text-[10px]">{tag}</Badge>
                    ))}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
