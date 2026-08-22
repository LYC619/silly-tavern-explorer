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
