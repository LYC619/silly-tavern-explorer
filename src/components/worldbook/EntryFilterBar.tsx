import { CheckSquare, ChevronLeft, ChevronRight, LayoutGrid, List, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Toggle } from '@/components/ui/toggle';
import { PrefixCategorize } from '@/components/worldbook/PrefixCategorize';
import { POSITION_LABELS } from '@/types/worldbook';
import type { WorldBookEntry } from '@/types/worldbook';
import type { EntryFilterControls, SearchScope, SortMode } from '@/hooks/use-entry-filters';

export type EntryViewMode = 'card' | 'list';

interface EntryFilterBarProps {
  controls: EntryFilterControls;
  viewMode: EntryViewMode;
  onViewModeChange: (mode: EntryViewMode) => void;
  onAddEntry: () => void;
  onEnterBatch: () => void;
  entries: Record<string, WorldBookEntry>;
  onPrefixCategorize: (updates: Record<string, { group: string; comment: string; order: number }>) => void;
}

/** 置顶筛选/搜索条：不随条目列表滚动，最多两行 */
export function EntryFilterBar({
  controls: c,
  viewMode,
  onViewModeChange,
  onAddEntry,
  onEnterBatch,
  entries,
  onPrefixCategorize,
}: EntryFilterBarProps) {
  return (
    <>
      {/* 行1：搜索 + 排序 + 筛选 + 每页条数 + 视图切换 */}
      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative w-56 max-w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={c.searchQuery}
            onChange={(e) => c.setSearchQuery(e.target.value)}
            placeholder="搜索…"
            className="h-8 pl-8 pr-7 text-sm"
          />
          {c.searchQuery && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => c.setSearchQuery('')}>
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        <Select value={c.searchScope} onValueChange={(v) => c.setSearchScope(v as SearchScope)}>
          <SelectTrigger className="h-8 w-24 text-xs shrink-0" title="搜索范围">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">搜全部</SelectItem>
            <SelectItem value="title">仅标题</SelectItem>
          </SelectContent>
        </Select>

        <Select value={c.sortMode} onValueChange={(v) => c.setSortMode(v as SortMode)}>
          <SelectTrigger className="h-8 w-28 text-xs shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="order-asc">Order 升序</SelectItem>
            <SelectItem value="order-desc">Order 降序</SelectItem>
            <SelectItem value="title">标题排序</SelectItem>
            <SelectItem value="uid">创建顺序</SelectItem>
          </SelectContent>
        </Select>

        {/* 筛选 Popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant={c.activeFilterCount > 0 ? 'default' : 'outline'} size="sm" className="h-8 text-xs gap-1">
              <SlidersHorizontal className="w-3.5 h-3.5" /> 筛选
              {c.activeFilterCount > 0 && (
                <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[11px] leading-none">{c.activeFilterCount}</Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3 space-y-3" align="start">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">策略</p>
              <div className="flex flex-wrap gap-1.5">
                <Toggle size="sm" pressed={c.filterConstant} onPressedChange={c.setFilterConstant}
                  className="h-7 text-xs px-2 data-[state=on]:bg-blue-500/20 data-[state=on]:text-blue-700">🔵 常驻</Toggle>
                <Toggle size="sm" pressed={c.filterKeyword} onPressedChange={c.setFilterKeyword}
                  className="h-7 text-xs px-2 data-[state=on]:bg-green-500/20 data-[state=on]:text-green-700">🟢 关键词</Toggle>
                <Toggle size="sm" pressed={c.filterVector} onPressedChange={c.setFilterVector}
                  className="h-7 text-xs px-2 data-[state=on]:bg-purple-500/20 data-[state=on]:text-purple-700">🔗 向量</Toggle>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">状态</p>
              <div className="flex flex-wrap gap-1.5">
                <Toggle size="sm" pressed={c.filterEnabled} onPressedChange={c.setFilterEnabled} className="h-7 text-xs px-2">已启用</Toggle>
                <Toggle size="sm" pressed={c.filterDisabled} onPressedChange={c.setFilterDisabled} className="h-7 text-xs px-2">已禁用</Toggle>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">位置</p>
              <Select value={c.filterPosition} onValueChange={c.setFilterPosition}>
                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="位置" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部位置</SelectItem>
                  {Object.entries(POSITION_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {c.hasFilters && (
              <Button variant="ghost" size="sm" className="h-7 text-xs w-full" onClick={c.clearFilters}>
                <X className="w-3 h-3 mr-1" /> 清除筛选
              </Button>
            )}
          </PopoverContent>
        </Popover>

        <Select value={String(c.pageSize)} onValueChange={(v) => c.setPageSize(Number(v))}>
          <SelectTrigger className="h-8 w-24 text-xs shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="25">25 / 页</SelectItem>
            <SelectItem value="50">50 / 页</SelectItem>
            <SelectItem value="100">100 / 页</SelectItem>
            <SelectItem value="0">全部</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex-1" />
        <div data-tour="wb-view-toggle" className="flex items-center gap-0">
          <Button variant={viewMode === 'card' ? 'default' : 'ghost'} size="icon" className="h-7 w-7"
            onClick={() => onViewModeChange('card')} aria-label="卡片视图">
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="icon" className="h-7 w-7"
            onClick={() => onViewModeChange('list')} aria-label="列表视图">
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* 行2：新增 / 批量 / 前缀归类 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onAddEntry}>
          <Plus className="w-3.5 h-3.5 mr-1" /> 新增
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs"
          onClick={onEnterBatch} data-tour="wb-batch">
          <CheckSquare className="w-3.5 h-3.5 mr-1" /> 批量
        </Button>
        <div data-tour="wb-prefix">
          <PrefixCategorize entries={entries} onApply={onPrefixCategorize} />
        </div>
      </div>
    </>
  );
}

interface EntryPaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (updater: (p: number) => number) => void;
}

export function EntryPagination({ page, totalPages, onPageChange }: EntryPaginationProps) {
  return (
    <div className="flex items-center justify-center gap-3 pt-2 pb-4">
      <Button variant="outline" size="sm" className="h-7 text-xs"
        disabled={page <= 1} onClick={() => onPageChange((p) => Math.max(1, p - 1))}>
        <ChevronLeft className="w-3.5 h-3.5 mr-0.5" /> 上一页
      </Button>
      <span className="text-xs text-muted-foreground">第 {page} / {totalPages} 页</span>
      <Button variant="outline" size="sm" className="h-7 text-xs"
        disabled={page >= totalPages} onClick={() => onPageChange((p) => Math.min(totalPages, p + 1))}>
        下一页 <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
      </Button>
    </div>
  );
}
