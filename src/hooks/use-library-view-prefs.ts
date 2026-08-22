import { useEffect, useState } from 'react';
import {
  CARD_W_DEFAULT, CARD_W_MAX, CARD_W_MIN, FONT_MAX, FONT_MIN,
  PAGE_SIZES, type PageSize, type ViewMode,
} from '@/lib/library-view';
import { LIBRARY_GROUP_BY_OPTIONS, type LibraryGroupBy } from '@/lib/library-grouping';

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* 隐私模式等场景静默忽略 */ }
}

export interface LibraryViewPrefs {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  groupBy: LibraryGroupBy;
  setGroupBy: (value: LibraryGroupBy) => void;
  groupTagCategory: string;
  setGroupTagCategory: (value: string) => void;
  cardWidth: number;
  setCardWidth: (value: number) => void;
  fontScale: number;
  setFontScale: (value: number) => void;
  pageSize: PageSize;
  setPageSize: (value: PageSize) => void;
}

/**
 * 角色库的外观偏好，全部持久化到 localStorage。
 * 读取时一律校验取值范围，坏数据（手改、旧版本残留）退回默认值而不是原样吃进去。
 */
export function useLibraryViewPrefs(): LibraryViewPrefs {
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    lsGet('ste-library-view') === 'list' ? 'list' : 'grid');
  const [groupBy, setGroupBy] = useState<LibraryGroupBy>(() => {
    const saved = lsGet('ste-library-group-by');
    return LIBRARY_GROUP_BY_OPTIONS.some((option) => option.value === saved)
      ? (saved as LibraryGroupBy)
      : 'none';
  });
  const [groupTagCategory, setGroupTagCategory] = useState(
    () => lsGet('ste-library-group-tag-category') ?? '人物');
  const [cardWidth, setCardWidth] = useState<number>(() => {
    const n = Number(lsGet('ste-library-card-width'));
    return n >= CARD_W_MIN && n <= CARD_W_MAX ? n : CARD_W_DEFAULT;
  });
  const [fontScale, setFontScale] = useState<number>(() => {
    const n = Number(lsGet('ste-library-font-scale'));
    return n >= FONT_MIN && n <= FONT_MAX ? n : 1;
  });
  const [pageSize, setPageSize] = useState<PageSize>(() => {
    const v = lsGet('ste-library-page-size');
    return PAGE_SIZES.includes(v as PageSize) ? (v as PageSize) : '24';
  });

  useEffect(() => lsSet('ste-library-view', viewMode), [viewMode]);
  useEffect(() => lsSet('ste-library-group-by', groupBy), [groupBy]);
  useEffect(() => lsSet('ste-library-group-tag-category', groupTagCategory), [groupTagCategory]);
  useEffect(() => lsSet('ste-library-card-width', String(cardWidth)), [cardWidth]);
  useEffect(() => lsSet('ste-library-font-scale', String(fontScale)), [fontScale]);
  useEffect(() => lsSet('ste-library-page-size', pageSize), [pageSize]);

  return {
    viewMode, setViewMode,
    groupBy, setGroupBy,
    groupTagCategory, setGroupTagCategory,
    cardWidth, setCardWidth,
    fontScale, setFontScale,
    pageSize, setPageSize,
  };
}
