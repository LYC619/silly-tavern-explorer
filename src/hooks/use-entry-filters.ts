import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WorldBookEntry } from '@/types/worldbook';

export type SortMode = 'order-asc' | 'order-desc' | 'title' | 'uid';
export type SearchScope = 'all' | 'title';

/** 世界书条目在页面里一律以 [key, entry] 成对流转，key 即 entries 字典的键 */
export type EntryPair = [string, WorldBookEntry];

export interface EntryFilterCriteria {
  searchQuery: string;
  searchScope: SearchScope;
  filterConstant: boolean;
  filterKeyword: boolean;
  filterVector: boolean;
  filterEnabled: boolean;
  filterDisabled: boolean;
  /** 'all' 或 position 的数字字符串 */
  filterPosition: string;
  sortMode: SortMode;
}

const EMPTY_CRITERIA: EntryFilterCriteria = {
  searchQuery: '',
  searchScope: 'all',
  filterConstant: false,
  filterKeyword: false,
  filterVector: false,
  filterEnabled: false,
  filterDisabled: false,
  filterPosition: 'all',
  sortMode: 'order-asc',
};

/** 纯函数：按条件筛选并排序。抽出来是为了能脱离 DOM 单测 */
export function applyEntryFilters(entries: EntryPair[], c: EntryFilterCriteria): EntryPair[] {
  let result = entries;

  if (c.searchQuery) {
    const q = c.searchQuery.toLowerCase();
    result = result.filter(([, e]) =>
      c.searchScope === 'title'
        ? e.comment.toLowerCase().includes(q)
        : e.comment.toLowerCase().includes(q) ||
          e.key.some((k) => k.toLowerCase().includes(q)) ||
          e.content.toLowerCase().includes(q)
    );
  }

  // 策略筛选：多选之间是「或」，不是逐层收窄
  if (c.filterConstant || c.filterKeyword || c.filterVector) {
    result = result.filter(([, e]) => {
      if (c.filterConstant && e.constant) return true;
      if (c.filterVector && e.vectorized) return true;
      if (c.filterKeyword && !e.constant && !e.vectorized) return true;
      return false;
    });
  }

  // 同时勾选「已启用」和「已禁用」等于不按状态筛选
  if (c.filterEnabled && !c.filterDisabled) result = result.filter(([, e]) => e.enabled);
  if (c.filterDisabled && !c.filterEnabled) result = result.filter(([, e]) => !e.enabled);

  if (c.filterPosition !== 'all') {
    const pos = Number(c.filterPosition);
    result = result.filter(([, e]) => e.position === pos);
  }

  return [...result].sort((a, b) => {
    const [, ea] = a, [, eb] = b;
    switch (c.sortMode) {
      case 'order-asc': return ea.order - eb.order;
      case 'order-desc': return eb.order - ea.order;
      case 'title': return ea.comment.localeCompare(eb.comment);
      case 'uid': return ea.uid - eb.uid;
      default: return 0;
    }
  });
}

/** 激活的筛选项数量（给「筛选」按钮角标），搜索词不计入 */
export function countActiveFilters(c: EntryFilterCriteria): number {
  return (c.filterConstant ? 1 : 0) + (c.filterKeyword ? 1 : 0) + (c.filterVector ? 1 : 0) +
    (c.filterEnabled ? 1 : 0) + (c.filterDisabled ? 1 : 0) + (c.filterPosition !== 'all' ? 1 : 0);
}

export interface EntryFilterControls extends EntryFilterCriteria {
  setSearchQuery: (v: string) => void;
  setSearchScope: (v: SearchScope) => void;
  setFilterConstant: (v: boolean) => void;
  setFilterKeyword: (v: boolean) => void;
  setFilterVector: (v: boolean) => void;
  setFilterEnabled: (v: boolean) => void;
  setFilterDisabled: (v: boolean) => void;
  setFilterPosition: (v: string) => void;
  setSortMode: (v: SortMode) => void;
  /** 每页条数，0 表示不分页 */
  pageSize: number;
  setPageSize: (v: number) => void;
  /** 搜索词或任一筛选项处于激活状态 */
  hasFilters: boolean;
  activeFilterCount: number;
  clearFilters: () => void;
}

export interface EntryFilterResult {
  controls: EntryFilterControls;
  /** 筛选排序后的全部条目 */
  filteredEntries: EntryPair[];
  /** 当前页切片；pageSize=0 时等于 filteredEntries */
  pagedEntries: EntryPair[];
  page: number;
  totalPages: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}

/**
 * 条目列表的筛选 / 排序 / 分页。
 *
 * 页码由本 hook 自己兜底：筛选条件或每页条数变化回到第 1 页，
 * 总页数缩减时把当前页夹回有效范围——调用方不需要再管越界。
 */
export function useEntryFilters(allEntries: EntryPair[]): EntryFilterResult {
  const [searchQuery, setSearchQuery] = useState(EMPTY_CRITERIA.searchQuery);
  const [searchScope, setSearchScope] = useState<SearchScope>(EMPTY_CRITERIA.searchScope);
  const [filterConstant, setFilterConstant] = useState(false);
  const [filterKeyword, setFilterKeyword] = useState(false);
  const [filterVector, setFilterVector] = useState(false);
  const [filterEnabled, setFilterEnabled] = useState(false);
  const [filterDisabled, setFilterDisabled] = useState(false);
  const [filterPosition, setFilterPosition] = useState(EMPTY_CRITERIA.filterPosition);
  const [sortMode, setSortMode] = useState<SortMode>(EMPTY_CRITERIA.sortMode);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const criteria = useMemo<EntryFilterCriteria>(() => ({
    searchQuery, searchScope, filterConstant, filterKeyword, filterVector,
    filterEnabled, filterDisabled, filterPosition, sortMode,
  }), [searchQuery, searchScope, filterConstant, filterKeyword, filterVector,
    filterEnabled, filterDisabled, filterPosition, sortMode]);

  const filteredEntries = useMemo(
    () => applyEntryFilters(allEntries, criteria),
    [allEntries, criteria],
  );

  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(filteredEntries.length / pageSize)) : 1;
  const pagedEntries = useMemo(() => {
    if (pageSize <= 0) return filteredEntries;
    const start = (page - 1) * pageSize;
    return filteredEntries.slice(start, start + pageSize);
  }, [filteredEntries, page, pageSize]);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);
  // 排序不改变结果集大小，故不复位页码；筛选条件与每页条数会
  useEffect(() => {
    setPage(1);
  }, [searchQuery, searchScope, filterConstant, filterKeyword, filterVector,
    filterEnabled, filterDisabled, filterPosition, pageSize]);

  const clearFilters = useCallback(() => {
    setSearchQuery(EMPTY_CRITERIA.searchQuery);
    setFilterConstant(false);
    setFilterKeyword(false);
    setFilterVector(false);
    setFilterEnabled(false);
    setFilterDisabled(false);
    setFilterPosition(EMPTY_CRITERIA.filterPosition);
  }, []);

  const hasFilters = Boolean(searchQuery) || countActiveFilters(criteria) > 0;

  return {
    controls: {
      ...criteria,
      setSearchQuery, setSearchScope, setFilterConstant, setFilterKeyword, setFilterVector,
      setFilterEnabled, setFilterDisabled, setFilterPosition, setSortMode,
      pageSize, setPageSize,
      hasFilters,
      activeFilterCount: countActiveFilters(criteria),
      clearFilters,
    },
    filteredEntries,
    pagedEntries,
    page,
    totalPages,
    setPage,
  };
}
