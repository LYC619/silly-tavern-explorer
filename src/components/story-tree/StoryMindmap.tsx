import { useMemo, useRef, useState } from 'react';
import { Upload, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { StoryNodeTree, StoryNodeType } from '@/types/story-tree';
import { splitContentSections } from '@/lib/story-tree-ai';
import { downloadSvg, downloadSvgAsPng } from '@/lib/svg-export';

const NODE_W = 176;
const NODE_H = 46;
const GAP_X = 44;
const GAP_Y = 10;

/**
 * 纸面配色写死为亮色（不随主题）：导图定位是"可分享的纸面地图"，
 * 全部样式内联 attr 才能原样导出 PNG/SVG（脱离页面 CSS 依然成立）。
 */
const PAPER = '#faf8f4';
const INK = '#3f3a33';
const INK_SUB = '#8a8271';
const EDGE = '#d3cbbb';
const BOX_FILL = '#ffffff';
const BOX_STROKE = '#ddd5c6';
const ROOT_FILL = '#f4eee1';
const ROOT_STROKE = '#c9b896';
const SELECT_STROKE = '#b8863b';
const SECTION_FILL = '#f7f4ec';
const SECTION_STROKE = '#e5ddc9';
const SECTION_LABEL = '#a16207';

/** 六类节点的着色，与树行圆点(NODE_TYPE_DOT)同色系 */
const TYPE_COLOR: Record<StoryNodeType, string> = {
  category: '#8b5cf6',
  character: '#0ea5e9',
  location: '#10b981',
  item: '#f59e0b',
  event: '#f43f5e',
  custom: '#94a3b8',
};

/** 布局盒：真实节点，或角色节点的分卷小节子块（子块正文优先展示，点击弹出全文） */
interface LaidBox {
  key: string;
  /** 点击选中的节点 id（小节块选中其所属角色） */
  nodeId: string;
  title: string;
  sub: string;
  type?: StoryNodeType;
  isSection: boolean;
  isRoot: boolean;
  archived: boolean;
  /** 小节块专用：卷标签 / 全文 / 所属角色名（供点击展开面板） */
  sectionLabel?: string;
  sectionBody?: string;
  sectionOwner?: string;
  x: number;
  y: number;
}

interface Edge { x1: number; y1: number; x2: number; y2: number }

/** 按显示宽度截断（CJK 记 1 个单位、其余记 0.55），超出加省略号 */
function fitText(text: string, maxUnits: number): string {
  let units = 0;
  for (let i = 0; i < text.length; i++) {
    units += text.charCodeAt(i) > 0x2e7f ? 1 : 0.55;
    if (units > maxUnits) return `${text.slice(0, i)}…`;
  }
  return text;
}

/** 按显示宽度切成两截：前一截正好占满预算（不加省略号），剩余给第二行继续截 */
function cutByUnits(text: string, maxUnits: number): { head: string; rest: string } {
  let units = 0;
  for (let i = 0; i < text.length; i++) {
    units += text.charCodeAt(i) > 0x2e7f ? 1 : 0.55;
    if (units > maxUnits) return { head: text.slice(0, i), rest: text.slice(i) };
  }
  return { head: text, rest: '' };
}

/** 内部布局树：真实子节点 + 角色的分卷小节伪子块 */
interface LayoutTree {
  key: string;
  nodeId: string;
  title: string;
  sub: string;
  type?: StoryNodeType;
  isSection: boolean;
  archived: boolean;
  sectionLabel?: string;
  sectionBody?: string;
  sectionOwner?: string;
  children: LayoutTree[];
}

function toLayoutTree(n: StoryNodeTree): LayoutTree {
  const children = n.children.map(toLayoutTree);
  // 角色节点：把正文的 `## 卷` 小节铺成子块，导图上直接看到各卷变化摘要（点击看全文）
  if (n.type === 'character') {
    const sections = splitContentSections(n.content).filter((s) => s.label);
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      const body = s.body.replace(/\s+/g, ' ').trim();
      children.push({
        key: `${n.id}-sec-${i}`,
        nodeId: n.id,
        title: body,
        sub: '',
        isSection: true,
        archived: n.archived,
        sectionLabel: s.label ?? '',
        sectionBody: s.body.trim(),
        sectionOwner: n.title,
        children: [],
      });
    }
  }
  return {
    key: n.id,
    nodeId: n.id,
    title: n.title,
    sub: n.hint || (n.type !== 'character' ? n.content.replace(/\s+/g, ' ').trim() : ''),
    type: n.type,
    isSection: false,
    archived: n.archived,
    children,
  };
}

function countLeaves(n: LayoutTree): number {
  if (!n.children.length) return 1;
  return n.children.reduce((s, c) => s + countLeaves(c), 0);
}

/** 横向树布局：x 由深度决定（从左到右），y 由子树叶子行数决定，父节点垂直居中于其子树。
 *  ponytail: 无平移/缩放，靠容器滚动；树超大（数百节点）时可升级 reactflow。 */
function layoutMindmap(forest: LayoutTree[]): { boxes: LaidBox[]; edges: Edge[]; width: number; height: number } {
  const boxes: LaidBox[] = [];
  const edges: Edge[] = [];
  let maxDepth = 0;

  const place = (n: LayoutTree, depth: number, top: number, isRoot: boolean): number => {
    maxDepth = Math.max(maxDepth, depth);
    const rows = countLeaves(n);
    const y = top + ((rows - 1) * (NODE_H + GAP_Y)) / 2;
    const x = depth * (NODE_W + GAP_X) + 8;
    boxes.push({
      key: n.key, nodeId: n.nodeId, title: n.title, sub: n.sub,
      type: n.type, isSection: n.isSection, isRoot, archived: n.archived,
      sectionLabel: n.sectionLabel, sectionBody: n.sectionBody, sectionOwner: n.sectionOwner,
      x, y,
    });
    let childTop = top;
    for (const c of n.children) {
      const childRows = countLeaves(c);
      const childY = childTop + ((childRows - 1) * (NODE_H + GAP_Y)) / 2;
      edges.push({
        x1: x + NODE_W, y1: y + NODE_H / 2,
        x2: (depth + 1) * (NODE_W + GAP_X) + 8, y2: childY + NODE_H / 2,
      });
      childTop = place(c, depth + 1, childTop, false);
    }
    return top + rows * (NODE_H + GAP_Y);
  };

  let top = 8;
  for (const r of forest) top = place(r, 0, top, true);
  return {
    boxes,
    edges,
    width: (maxDepth + 1) * (NODE_W + GAP_X) - GAP_X + 24,
    height: Math.max(top - GAP_Y, NODE_H) + 16,
  };
}

interface StoryMindmapProps {
  forest: StoryNodeTree[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** 导出文件名用的树标题 */
  title?: string;
}

/**
 * 导图视图：纯 SVG 绘制（样式全内联），单占一整行；角色节点右侧铺出各卷变化摘要子块，
 * 点子块弹出该卷全文；支持一键导出 PNG / SVG。点击节点选中（编辑器在下方）。
 */
export function StoryMindmap({ forest, selectedId, onSelect, title }: StoryMindmapProps) {
  const { toast } = useToast();
  const svgRef = useRef<SVGSVGElement>(null);
  const [exporting, setExporting] = useState(false);
  // 点开的分卷子块（弹出全文面板）
  const [activeSection, setActiveSection] = useState<{ owner: string; label: string; body: string } | null>(null);
  const layoutForest = useMemo(() => forest.map(toLayoutTree), [forest]);
  const { boxes, edges, width, height } = useMemo(() => layoutMindmap(layoutForest), [layoutForest]);

  if (!boxes.length) {
    return <p className="text-sm text-muted-foreground py-8 text-center">没有可显示的节点。</p>;
  }

  const safeName = (title || '故事树').replace(/[\\/:*?"<>|]/g, '_');

  const handleExportPng = async () => {
    if (!svgRef.current) return;
    setExporting(true);
    try {
      await downloadSvgAsPng(svgRef.current, `${safeName}-导图.png`);
      toast({ title: '已导出 PNG' });
    } catch (e) {
      toast({ title: '导出失败', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const handleExportSvg = () => {
    if (!svgRef.current) return;
    downloadSvg(svgRef.current, `${safeName}-导图.svg`);
    toast({ title: '已导出 SVG' });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <p className="text-xs text-muted-foreground flex-1 min-w-0">
          角色右侧的浅色子块 = 各卷变化摘要，点子块看该卷全文；点击节点在下方编辑。
        </p>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={handleExportPng} disabled={exporting}>
          {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}导出 PNG
        </Button>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={handleExportSvg}>
          <Upload className="w-3 h-3" />导出 SVG
        </Button>
      </div>

      {/* 点开的分卷全文面板 */}
      {activeSection && (
        <div className="rounded-md border border-primary/30 bg-card p-3 space-y-1 animate-fade-in">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium text-primary">
              {activeSection.owner} · {activeSection.label}
            </p>
            <button
              onClick={() => setActiveSection(null)}
              className="text-muted-foreground hover:text-foreground shrink-0"
              aria-label="关闭全文"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap max-h-44 overflow-y-auto">
            {activeSection.body}
          </p>
        </div>
      )}

      <div className="overflow-auto rounded-md border max-h-[72vh]" style={{ background: PAPER }}>
        <svg ref={svgRef} width={width} height={height} role="img" aria-label="故事树导图">
          <rect x={0} y={0} width={width} height={height} fill={PAPER} />
          {edges.map((e, i) => (
            <path
              key={i}
              d={`M ${e.x1} ${e.y1} C ${e.x1 + GAP_X / 2} ${e.y1}, ${e.x2 - GAP_X / 2} ${e.y2}, ${e.x2} ${e.y2}`}
              stroke={EDGE}
              strokeWidth={1.5}
              fill="none"
            />
          ))}
          {boxes.map((b) => {
            const selected = selectedId === b.nodeId && !b.isSection;
            const accent = b.type ? TYPE_COLOR[b.type] : null;
            // 小节子块：正文摘要占两行（点击弹全文）；普通节点：标题 + 提示
            const line1 = b.isSection ? cutByUnits(b.title, 12.5).head : fitText(b.title || '(未命名)', 12.5);
            const line2 = b.isSection ? fitText(cutByUnits(b.title, 12.5).rest, 15) : (b.sub ? fitText(b.sub, 15) : '');
            return (
              <g
                key={b.key}
                onClick={() => {
                  onSelect(b.nodeId);
                  if (b.isSection) {
                    setActiveSection({ owner: b.sectionOwner ?? '', label: b.sectionLabel ?? '', body: b.sectionBody ?? '' });
                  } else {
                    setActiveSection(null);
                  }
                }}
                style={{ cursor: 'pointer' }}
                opacity={b.archived ? 0.45 : 1}
              >
                {/* 悬停原生提示：小节显示卷标签+全文开头 */}
                <title>{b.isSection ? `${b.sectionLabel}\n${b.sectionBody}` : (b.sub ? `${b.title}｜${b.sub}` : b.title)}</title>
                <rect
                  x={b.x} y={b.y} width={NODE_W} height={NODE_H} rx={7}
                  fill={b.isSection ? SECTION_FILL : b.isRoot ? ROOT_FILL : BOX_FILL}
                  stroke={selected ? SELECT_STROKE : b.isSection ? SECTION_STROKE : b.isRoot ? ROOT_STROKE : BOX_STROKE}
                  strokeWidth={selected ? 2 : 1}
                />
                {accent && !b.isSection && (
                  <rect x={b.x} y={b.y + 6} width={3} height={NODE_H - 12} rx={1.5} fill={accent} />
                )}
                {b.isSection ? (
                  <>
                    <text x={b.x + 10} y={b.y + 18} fontSize={11} fill={INK}>{line1}</text>
                    {line2
                      ? <text x={b.x + 10} y={b.y + 34} fontSize={10} fill={INK_SUB}>{line2}</text>
                      : <text x={b.x + 10} y={b.y + 34} fontSize={9} fill={SECTION_LABEL}>{fitText(b.sectionLabel ?? '', 16)}</text>}
                  </>
                ) : (
                  <>
                    <text x={b.x + 12} y={b.y + 19} fontSize={12} fontWeight={600} fill={INK}>{line1}</text>
                    {line2 && <text x={b.x + 12} y={b.y + 36} fontSize={10} fill={INK_SUB}>{line2}</text>}
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
