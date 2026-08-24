/**
 * 角色库的外观取值与文案。
 *
 * 单独成文件是为了让组件文件只导出组件——常量与组件同文件会触发
 * react-refresh/only-export-components，热更新时整个模块会被丢弃重建。
 */
import type { LibrarySortKey } from '@/lib/library-query';

export type ViewMode = 'grid' | 'list';

export const SORT_LABELS: Record<LibrarySortKey, string> = {
  recent: '按最近修改',
  added: '按最近加入',
  name: '按名称',
  rating: '按评分',
  lastPlayed: '按最后游玩',
};

/** 卡片最小宽度（px）可调范围；网格用 auto-fill 按此值自动排列数 */
export const CARD_W_MIN = 150;
export const CARD_W_MAX = 300;
export const CARD_W_DEFAULT = 200;

/** 卡面字体缩放（外观钮）：作用于名称/简介 */
export const FONT_MIN = 0.85;
export const FONT_MAX = 1.3;

/** 全项目字号下限（docs/ui-conventions.md 第六节）。 */
export const MIN_FONT_PX = 11;

/**
 * 卡面各处字号。基准值乘 fontScale 之后统一夹到 11px 下限——简介的基准是
 * 12px，光乘 FONT_MIN 会算出 10px，比契约里禁掉的那档还小。下限写在这里而不是
 * 抬 FONT_MIN，是为了让名称仍能跟着缩到 13px，保住名称与简介的层级差。
 */
export function cardFontSizes(scale: number): { name: number; intro: number; rowName: number } {
  const clamp = (base: number) => Math.max(MIN_FONT_PX, Math.round(base * scale));
  return { name: clamp(15), intro: clamp(12), rowName: clamp(14) };
}

/** 每页张数选项；'all' = 不分页 */
export const PAGE_SIZES = ['12', '24', '48', '96', 'all'] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const PAGE_SIZE_LABELS: Record<PageSize, string> = {
  '12': '每页 12 张',
  '24': '每页 24 张',
  '48': '每页 48 张',
  '96': '每页 96 张',
  all: '不分页',
};

/** 激活筛选 chip：搜索+筛选叠加要可感知，点一下就能摘掉 */
export interface ActiveFilterChip {
  key: string;
  label: string;
  clear: () => void;
}
