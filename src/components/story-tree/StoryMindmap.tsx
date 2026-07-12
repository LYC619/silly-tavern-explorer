import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { StoryNodeTree } from '@/types/story-tree';

const NODE_W = 160;
const NODE_H = 40;
const GAP_X = 48;
const GAP_Y = 10;

interface LaidNode {
  id: string;
  title: string;
  hint: string;
  depth: number;
  x: number;
  y: number;
  archived: boolean;
}

interface Edge { x1: number; y1: number; x2: number; y2: number }

function countLeaves(n: StoryNodeTree): number {
  if (!n.children.length) return 1;
  return n.children.reduce((s, c) => s + countLeaves(c), 0);
}

/**
 * 横向树布局：x 由深度决定（从左到右），y 由子树叶子行数决定，父节点垂直居中于其子树。
 * ponytail: 无平移/缩放，靠容器滚动；树超大（数百节点）时可升级 reactflow。
 */
function layoutMindmap(forest: StoryNodeTree[]): { nodes: LaidNode[]; edges: Edge[]; width: number; height: number } {
  const nodes: LaidNode[] = [];
  const edges: Edge[] = [];
  let maxDepth = 0;

  const place = (n: StoryNodeTree, depth: number, top: number): number => {
    maxDepth = Math.max(maxDepth, depth);
    const rows = countLeaves(n);
    const y = top + ((rows - 1) * (NODE_H + GAP_Y)) / 2;
    const x = depth * (NODE_W + GAP_X);
    nodes.push({ id: n.id, title: n.title, hint: n.hint, depth, x, y, archived: n.archived });
    let childTop = top;
    for (const c of n.children) {
      const childRows = countLeaves(c);
      const childY = childTop + ((childRows - 1) * (NODE_H + GAP_Y)) / 2;
      edges.push({ x1: x + NODE_W, y1: y + NODE_H / 2, x2: (depth + 1) * (NODE_W + GAP_X), y2: childY + NODE_H / 2 });
      childTop = place(c, depth + 1, childTop);
    }
    return top + rows * (NODE_H + GAP_Y);
  };

  let top = 8;
  for (const r of forest) top = place(r, 0, top);
  return {
    nodes,
    edges,
    width: (maxDepth + 1) * (NODE_W + GAP_X) - GAP_X + 16,
    height: Math.max(top - GAP_Y, NODE_H) + 16,
  };
}

interface StoryMindmapProps {
  forest: StoryNodeTree[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** 只读导图视图：浏览全貌 + 点击选中（编辑仍在右栏） */
export function StoryMindmap({ forest, selectedId, onSelect }: StoryMindmapProps) {
  const { nodes, edges, width, height } = useMemo(() => layoutMindmap(forest), [forest]);

  if (!nodes.length) {
    return <p className="text-sm text-muted-foreground py-8 text-center">没有可显示的节点。</p>;
  }

  return (
    <div className="overflow-auto rounded-md border bg-muted/20 max-h-[60vh]">
      <div className="relative" style={{ width, height }}>
        <svg className="absolute inset-0 pointer-events-none" width={width} height={height}>
          {edges.map((e, i) => (
            <path
              key={i}
              d={`M ${e.x1} ${e.y1} C ${e.x1 + GAP_X / 2} ${e.y1}, ${e.x2 - GAP_X / 2} ${e.y2}, ${e.x2} ${e.y2}`}
              className="stroke-border"
              strokeWidth={1.5}
              fill="none"
            />
          ))}
        </svg>
        {nodes.map((n) => (
          <button
            key={n.id}
            onClick={() => onSelect(n.id)}
            title={n.hint ? `${n.title}｜${n.hint}` : n.title}
            className={cn(
              'absolute rounded-md border bg-card px-2 py-1 text-left shadow-sm transition-colors hover:border-primary/60',
              n.depth === 0 && 'border-primary/40 bg-primary/5',
              selectedId === n.id && 'ring-2 ring-primary border-primary',
              n.archived && 'opacity-50'
            )}
            style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
          >
            <div className="truncate text-xs font-medium leading-tight">{n.title || '(未命名)'}</div>
            {n.hint && <div className="truncate text-[10px] text-muted-foreground leading-tight">{n.hint}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}
