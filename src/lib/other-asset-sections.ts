/**
 * 「其他资产」的子分类清单与图标：附属库页面拿它建侧栏，浏览器组件拿它渲染正文。
 *
 * 单独一个模块而不是挂在 OtherAssetsBrowser.tsx 里：这些是页面和组件之间的共用词汇，
 * 页面只为了一份清单和一张图标表去 import 组件文件不太对；顺带也不会再触发
 * react-refresh 那条「组件文件别混着导出常量」的告警。
 * 和 navigation-model.ts 一样，是允许 import lucide 的数据模块。
 */
import {
  Archive,
  Code2,
  Folder,
  Image as ImageIcon,
  LayoutGrid,
  MessageSquareReply,
  Palette,
  UserRound,
} from 'lucide-react';
import { OTHER_ASSET_CATEGORIES, type OtherAssetCategoryId } from '@/lib/vault/other-assets';

/** 概览 + 归档七类。`?section=` 的取值范围就是这些。 */
export type BrowserSection = 'overview' | OtherAssetCategoryId;

export const SECTION_ICONS: Record<BrowserSection, typeof Archive> = {
  overview: LayoutGrid,
  extensions: Code2,
  assets: Folder,
  'quick-replies': MessageSquareReply,
  personas: UserRound,
  backgrounds: ImageIcon,
  appearance: Palette,
  'user-media': Archive,
};

/** 侧栏里「其他资产」下挂的子分类（概览 + 归档七类） */
export const OTHER_ASSET_SECTIONS: readonly { id: BrowserSection; label: string; description: string }[] = [
  { id: 'overview', label: '概览', description: '查看全部归档分类' },
  ...OTHER_ASSET_CATEGORIES,
];

export function isBrowserSection(value: string | null): value is BrowserSection {
  return value === 'overview' || OTHER_ASSET_CATEGORIES.some((category) => category.id === value);
}

/** 从 `?section=` 读子分类；缺失或不认识的值都回到概览。侧栏高亮和正文区共用这一份判断。 */
export function readBrowserSection(value: string | null): BrowserSection {
  return isBrowserSection(value) ? value : 'overview';
}
