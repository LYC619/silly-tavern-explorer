import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { StoryNode, StoryNodeType } from '@/types/story-tree';
import { NODE_TYPE_LABELS, NODE_TYPE_BORDER } from '@/types/story-tree';
import { splitContentSections } from '@/lib/story-tree-ai';

/**
 * 卡片视图分组顺序：分类节点是结构容器不单独展示；事件不进卡片（时间轴专管，
 * 两边重复展示只会互相干扰）；未分类兜底放最后（兼容老数据）。
 */
const GROUP_ORDER: (StoryNodeType | 'none')[] = ['character', 'location', 'item', 'custom', 'none'];

interface StoryCardViewProps {
  nodes: StoryNode[];
  selectedId: string | null;
  /** 搜索命中集合；null=未在搜索 */
  hitIds: Set<string> | null;
  onSelect: (id: string) => void;
}

/** 卡片正文预览：角色显示最新一卷的状态（变化轨迹的"当前值"），其余显示正文 */
function nodePreview(node: StoryNode): { label: string | null; text: string } {
  if (node.type === 'character') {
    const secs = splitContentSections(node.content).filter((s) => s.label);
    if (secs.length) {
      const last = secs[secs.length - 1];
      return { label: last.label, text: last.body };
    }
  }
  return { label: null, text: node.content };
}

/** 卡片视图：按类型分组平铺，适合快速浏览角色/地点/物品设定（事件请看时间轴） */
export function StoryCardView({ nodes, selectedId, hitIds, onSelect }: StoryCardViewProps) {
  const { groups, eventCount } = useMemo(() => {
    const map = new Map<StoryNodeType | 'none', StoryNode[]>();
    // 无类型但有子节点的 = 结构容器（老数据里 AI 自动建的「角色/事件」等父类目没标 category），
    // 和 category 一样不进实体卡片
    const parentIds = new Set(nodes.map((n) => n.parentId));
    let events = 0;
    for (const node of nodes) {
      if (node.archived || node.type === 'category') continue;
      if (!node.type && parentIds.has(node.id)) continue;
      if (node.type === 'event') { events++; continue; }
      if (hitIds && !hitIds.has(node.id)) continue;
      const key = node.type ?? 'none';
      const list = map.get(key);
      if (list) list.push(node);
      else map.set(key, [node]);
    }
    return {
      groups: GROUP_ORDER.filter((t) => map.has(t)).map((t) => ({
        type: t,
        items: (map.get(t) ?? []).sort((a, b) => a.order - b.order),
      })),
      eventCount: events,
    };
  }, [nodes, hitIds]);

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        没有可显示的节点{eventCount > 0 ? `（${eventCount} 个事件节点请切到「时间轴」查看）` : ''}
      </p>
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
            {group.items.map((node) => {
              const preview = nodePreview(node);
              return (
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
                  {preview.label && (
                    <span className="text-[10px] text-primary/80 truncate">最新 · {preview.label}</span>
                  )}
                  {preview.text && (
                    <span className="line-clamp-3 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                      {preview.text}
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
              );
            })}
          </div>
        </section>
      ))}
      {eventCount > 0 && (
        <p className="text-[11px] text-muted-foreground">
          另有 {eventCount} 个事件节点，请切到「时间轴」按剧情顺序查看。
        </p>
      )}
    </div>
  );
}
