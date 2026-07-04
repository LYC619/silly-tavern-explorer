import { ChevronRight, ChevronDown, Plus, Pin, Archive, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StoryNodeTree } from '@/types/story-tree';

interface StoryTreeViewProps {
  forest: StoryNodeTree[];
  selectedId: string | null;
  collapsed: Set<string>;
  showArchived: boolean;
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onAddChild: (parentId: string) => void;
  /** 拖拽移动：把 draggedId 放到 targetId 之前（同层）或作为其子（drop 到节点体） */
  onMove: (draggedId: string, targetId: string, asChild: boolean) => void;
}

/** 递归的可交互树视图：展开折叠 + 选中 + 增子 + 原生 HTML5 拖拽移动 */
export function StoryTreeView({
  forest, selectedId, collapsed, showArchived,
  onSelect, onToggleCollapse, onAddChild, onMove,
}: StoryTreeViewProps) {
  const renderNode = (node: StoryNodeTree, depth: number) => {
    if (!showArchived && node.archived) return null;
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.id);
    const isSelected = selectedId === node.id;

    return (
      <div key={node.id}>
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', node.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const draggedId = e.dataTransfer.getData('text/plain');
            if (draggedId && draggedId !== node.id) onMove(draggedId, node.id, true);
          }}
          onClick={() => onSelect(node.id)}
          className={cn(
            'group flex items-center gap-1 py-1 pr-2 rounded cursor-pointer text-sm',
            isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-accent/50',
            node.archived && 'opacity-50'
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
    <div
      className="space-y-0.5"
      // drop 到空白根区域 = 移到根层末尾（targetId 为空时页面处理）
      onDragOver={(e) => e.preventDefault()}
    >
      {forest.map((n) => renderNode(n, 0))}
    </div>
  );
}
