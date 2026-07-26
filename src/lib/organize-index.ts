/**
 * 整理与记录·左栏统一索引（2.0 阶段3，定稿 5.2）。
 * 把总结/日记/自定义记录(diy)/故事树合成一份按最近修改排序的索引，
 * 支持按类型/分支筛选与搜索；纯函数，UI 与存储无关。
 */
import type { SummaryItem, SummaryGenParams, SummaryKind } from '@/types/summary';
import type { StoryTree } from '@/types/story-tree';
import { SUMMARY_KIND_LABELS, generateSummaryId } from '@/types/summary';
import { generateStoryTreeId } from '@/types/story-tree';
import { getBuiltinTemplate } from '@/lib/summary-templates';

/** 索引条目：record=总结/日记/diy（SummaryItem），tree=故事树 */
export interface OrganizeEntry {
  type: 'record' | 'tree';
  id: string;
  title: string;
  /** 类型标签；diy 显示模板名（如「散文型总结」），无模板名时回退「DIY 创作」 */
  kindLabel: string;
  kind?: SummaryKind;
  volumeNumber?: number;
  floorStart?: number;
  floorEnd?: number;
  branchId?: string;
  /** record 内容为空 = 草稿（只占了楼层范围） */
  draft: boolean;
  /** record 的自动暂存标记（列表标注永久/暂存） */
  autoSaved?: boolean;
  updatedAt: number;
}

export type OrganizeKindFilter = 'all' | SummaryKind | 'tree';
/** 分支筛选：all=全部；main=主线（含无分支标注的旧条目）；其余为分支 id */
export type OrganizeBranchFilter = 'all' | 'main' | string;

export interface OrganizeFilter {
  kind: OrganizeKindFilter;
  branch: OrganizeBranchFilter;
  query: string;
}

/**
 * 记录的模板显示名：优先生成时的快照 templateTitle，
 * 其次内置模板按 id 查名，都没有则 undefined（由调用方回退 kind 标签）。
 */
export function resolveTemplateTitle(gp?: SummaryGenParams): string | undefined {
  if (!gp) return undefined;
  if (gp.templateTitle) return gp.templateTitle;
  if (gp.templateId) return getBuiltinTemplate(gp.templateId)?.title;
  return undefined;
}

function summaryToEntry(s: SummaryItem): OrganizeEntry {
  const templateTitle = s.kind === 'diy' ? resolveTemplateTitle(s.genParams) : undefined;
  return {
    type: 'record',
    id: s.id,
    title: s.title || SUMMARY_KIND_LABELS[s.kind],
    kindLabel: templateTitle ?? SUMMARY_KIND_LABELS[s.kind],
    kind: s.kind,
    volumeNumber: s.volumeNumber,
    floorStart: s.floorStart,
    floorEnd: s.floorEnd,
    branchId: s.branchId,
    draft: !s.content,
    autoSaved: s.autoSaved,
    updatedAt: s.updatedAt,
  };
}

function treeToEntry(t: StoryTree): OrganizeEntry {
  return {
    type: 'tree',
    id: t.id,
    title: t.title || '未命名故事树',
    kindLabel: '故事树',
    draft: t.nodes.length === 0,
    updatedAt: t.updatedAt,
  };
}

/**
 * 合成统一索引：按 updatedAt 由新到旧。
 * 分支筛选只对 record 有意义；故事树是故事级资源，在 all/main 下均显示，
 * 选中具体分支时隐藏（它不属于任何分支）。
 */
export function buildOrganizeIndex(
  summaries: SummaryItem[],
  trees: StoryTree[],
  filter: OrganizeFilter,
): OrganizeEntry[] {
  const q = filter.query.trim().toLowerCase();
  const entries: OrganizeEntry[] = [];

  if (filter.kind !== 'tree') {
    for (const s of summaries) {
      if (filter.kind !== 'all' && s.kind !== filter.kind) continue;
      if (filter.branch === 'main' && s.branchId) continue;
      if (filter.branch !== 'all' && filter.branch !== 'main' && s.branchId !== filter.branch) continue;
      entries.push(summaryToEntry(s));
    }
  }
  if (filter.kind === 'all' || filter.kind === 'tree') {
    if (filter.branch === 'all' || filter.branch === 'main') {
      for (const t of trees) entries.push(treeToEntry(t));
    }
  }

  const matched = q
    ? entries.filter((e) => e.title.toLowerCase().includes(q) || e.kindLabel.toLowerCase().includes(q))
    : entries;
  return matched.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 默认打开最近创建或修改的一条（定稿 5.2）；空索引返回 undefined */
export function pickDefaultEntry(entries: OrganizeEntry[]): OrganizeEntry | undefined {
  return entries[0];
}

/** 复制为新记录：新 id、标题加「（副本）」、转为手动条目（不受自动清理影响），时间戳更新 */
export function copyAsNewSummary(item: SummaryItem, now = Date.now()): SummaryItem {
  return {
    ...item,
    id: generateSummaryId(),
    title: item.title ? `${item.title}（副本）` : `${SUMMARY_KIND_LABELS[item.kind]}（副本）`,
    autoSaved: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** 复制为新故事树：新 id + 标题加「（副本）」；节点 id 原样保留（id 只需树内唯一） */
export function copyAsNewTree(tree: StoryTree, now = Date.now()): StoryTree {
  return {
    ...tree,
    id: generateStoryTreeId(),
    title: `${tree.title || '未命名故事树'}（副本）`,
    autoSaved: false,
    createdAt: now,
    updatedAt: now,
  };
}
