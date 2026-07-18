import { useState } from 'react';
import { ChevronRight, ChevronDown, Plus, Pin, Archive, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StoryNodeTree } from '@/types/story-tree';
import { NODE_TYPE_DOT, NODE_TYPE_LABELS } from '@/types/story-tree';

export type DropZone = 'before' | 'after' | 'inside';

interface StoryTreeViewProps {
  forest: StoryNodeTree[];
  selectedId: string | null;
  collapsed: Set<string>;
  showArchived: boolean;
  /** 搜索命中集合；null=未在搜索。搜索时非命中行淡化（保留上下文不隐藏） */
  hitIds: Set<string> | null;
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onAddChild: (parentId: string) => void;
  /** 拖拽移动：zone=before/after 放到目标同级前/后，inside 作为其子节点；targetId=null 移到根层末尾 */
  onMove: (draggedId: string, targetId: string | null, zone: DropZone) => void;
}

/** 指针在行内的纵向位置 → 落点：上 30% 前插、下 30% 后插、中间作子节点 */
function computeZone(e: React.DragEvent<HTMLDivElement>): DropZone {
  const rect = e.currentTarget.getBoundingClientRect();
  const ratio = (e.clientY - rect.top) / Math.max(rect.height, 1);
  return ratio < 0.3 ? 'before' : ratio > 0.7 ? 'after' : 'inside';
}

/** 递归的可交互树视图：展开折叠 + 选中 + 增子 + 原生 HTML5 三落点拖拽移动 */
export function StoryTreeView({
  forest, selectedId, collapsed, showArchived, hitIds,
  onSelect, onToggleCollapse, onAddChild, onMove,
}: StoryTreeViewProps) {
  const [dragOver, setDragOver] = useState<{ id: string; zone: DropZone } | null>(null);
  const [overRoot, setOverRoot] = useState(false);

  const renderNode = (node: StoryNodeTree, depth: number) => {
    if (!showArchived && node.archived) return null;
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.id);
    const isSelected = selectedId === node.id;
    const isDimmed = hitIds !== null && !hitIds.has(node.id);
    const zone = dragOver?.id === node.id ? dragOver.zone : null;

    return (
      <div key={node.id}>
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', node.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            const z = computeZone(e);
            setDragOver((cur) => (cur?.id === node.id && cur.zone === z ? cur : { id: node.id, zone: z }));
          }}
          onDragLeave={() => setDragOver((cur) => (cur?.id === node.id ? null : cur))}
          onDragEnd={() => { setDragOver(null); setOverRoot(false); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const z = computeZone(e);
            setDragOver(null);
            const draggedId = e.dataTransfer.getData('text/plain');
            if (draggedId && draggedId !== node.id) onMove(draggedId, node.id, z);
          }}
          onClick={() => onSelect(node.id)}
          className={cn(
            'group flex items-center gap-1 py-1 pr-2 rounded cursor-pointer text-sm transition-opacity',
            isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-accent/50',
            node.archived && 'opacity-50',
            isDimmed && 'opacity-35',
            zone === 'inside' && 'ring-1 ring-primary bg-primary/5',
            zone === 'before' && 'shadow-[inset_0_2px_0_0_hsl(var(--primary))]',
            zone === 'after' && 'shadow-[inset_0_-2px_0_0_hsl(var(--primary))]'
          )}
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
        >
          <GripVertical className="w-3 h-3 text-muted-foreground/40 shrink-0 cursor-grab" />
          {hasChildren ? (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCollapse(node.id); }}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          {node.type && (
            <span
              className={cn('w-2 h-2 rounded-full shrink-0', NODE_TYPE_DOT[node.type])}
              title={NODE_TYPE_LABELS[node.type]}
            />
          )}
          <span className="truncate flex-1">{node.title || '(未命名)'}</span>
          {node.pinned && <Pin className="w-3 h-3 text-primary shrink-0" />}
          {node.archived && <Archive className="w-3 h-3 text-muted-foreground shrink-0" />}
          {node.hint && <span className="text-xs text-muted-foreground truncate max-w-[30%] hidden sm:inline">{node.hint}</span>}
          <button
            onClick={(e) => { e.stopPropagation(); onAddChild(node.id); }}
            className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
            title="添加子节点"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {hasChildren && !isCollapsed && (
          <div>{node.children.map((c) => renderNode(c, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-0.5" onDragOver={(e) => e.preventDefault()}>
      {forest.map((n) => renderNode(n, 0))}
      {/* 根级落点：拖到这里 = 移到顶层末尾 */}
      <div
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverRoot(true); }}
        onDragLeave={() => setOverRoot(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOverRoot(false);
          setDragOver(null);
          const draggedId = e.dataTransfer.getData('text/plain');
          if (draggedId) onMove(draggedId, null, 'inside');
        }}
        className={cn(
          'mt-1 rounded border border-dashed px-2 py-1.5 text-center text-xs text-muted-foreground/70 transition-colors',
          overRoot ? 'border-primary text-primary bg-primary/5' : 'border-border/60'
        )}
      >
        拖到此处移到顶层
      </div>
    </div>
  );
}
