import { ChevronLeft, ChevronRight, Tags, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PAGE_SIZES, PAGE_SIZE_LABELS, type PageSize } from '@/lib/library-view';

interface LibraryPagerProps {
  total: number;
  page: number;
  pageCount: number;
  pageSize: PageSize;
  onPageSizeChange: (size: PageSize) => void;
  onPageChange: (updater: (p: number) => number) => void;
}

/** 分页栏：总数与当前区间 + 每页张数 + 上下页 */
export function LibraryPager({
  total, page, pageCount, pageSize, onPageSizeChange, onPageChange,
}: LibraryPagerProps) {
  const paged = pageSize !== 'all' && pageCount > 1;
  return (
    <div className="flex items-center gap-2 mt-4 pb-2">
      <span className="text-xs text-[color:var(--text-faint)]">
        共 {total} 张
        {paged && (
          <>
            {' · 第 '}
            {(page - 1) * Number(pageSize) + 1}–{Math.min(page * Number(pageSize), total)}
            {' 张'}
          </>
        )}
      </span>
      <span className="flex-1" />
      <Select value={pageSize} onValueChange={(v) => onPageSizeChange(v as PageSize)}>
        <SelectTrigger className="h-8 w-28 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PAGE_SIZES.map((s) => (
            <SelectItem key={s} value={s}>{PAGE_SIZE_LABELS[s]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {paged && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline" size="icon"
            disabled={page <= 1}
            onClick={() => onPageChange((p) => p - 1)}
            aria-label="上一页"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs text-[color:var(--text-muted)] min-w-[3.5rem] text-center">
            {page} / {pageCount}
          </span>
          <Button
            variant="outline" size="icon"
            disabled={page >= pageCount}
            onClick={() => onPageChange((p) => p + 1)}
            aria-label="下一页"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

interface LibraryBatchBarProps {
  selectedCount: number;
  filteredCount: number;
  onSelectAllToggle: () => void;
  onTag: () => void;
  onExport: () => void;
  exporting: boolean;
  onDelete: () => void;
  onExit: () => void;
}

/** 批量模式的常驻底栏：全选筛选结果 / 打标签 / 导出 / 删除 */
export function LibraryBatchBar({
  selectedCount, filteredCount, onSelectAllToggle, onTag, onExport, exporting, onDelete, onExit,
}: LibraryBatchBarProps) {
  const allSelected = selectedCount === filteredCount && filteredCount > 0;
  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 shadow-lg flex-wrap">
      <span className="text-sm">已选 {selectedCount} 个</span>
      <Button variant="ghost" size="sm" className="px-2 text-xs" onClick={onSelectAllToggle}>
        {allSelected ? '清空' : '全选筛选结果'}
      </Button>
      <Button
        variant="outline" size="sm" className="px-3 text-xs"
        disabled={selectedCount === 0}
        onClick={onTag}
      >
        <Tags className="w-3.5 h-3.5 mr-1" />
        打标签
      </Button>
      <Button
        variant="outline" size="sm" className="px-3 text-xs"
        disabled={selectedCount === 0 || exporting}
        onClick={onExport}
      >
        <Upload className="w-3.5 h-3.5 mr-1" />
        {exporting ? '导出中…' : '导出'}
      </Button>
      <Button
        variant="destructive" size="sm" className="px-3 text-xs"
        disabled={selectedCount === 0}
        onClick={onDelete}
      >
        <Trash2 className="w-3.5 h-3.5 mr-1" />
        删除
      </Button>
      <Button variant="ghost" size="sm" className="px-2 text-xs text-muted-foreground" onClick={onExit}>
        取消
      </Button>
    </div>
  );
}
