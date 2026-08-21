import { ScrollArea } from '@/components/ui/scroll-area';
import { EntryCard } from '@/components/worldbook/EntryCard';
import { EntryListRow } from '@/components/worldbook/EntryListRow';
import { EntryPagination, type EntryViewMode } from '@/components/worldbook/EntryFilterBar';
import type { EntryPair } from '@/hooks/use-entry-filters';

interface EntryListPanelProps {
  pagedEntries: EntryPair[];
  viewMode: EntryViewMode;
  selectedUid: string | null;
  onSelect: (key: string) => void;
  onToggleEnabled: (key: string, enabled: boolean) => void;
  onDelete: (key: string) => void;
  batchMode: boolean;
  batchSelected: Set<string>;
  onBatchToggle: (key: string, checked: boolean, shiftKey?: boolean) => void;
  /** 筛选后为空：区分「本来就没有条目」和「筛掉了」，只有后者给提示 */
  showFilteredEmpty: boolean;
  page: number;
  totalPages: number;
  onPageChange: (updater: (p: number) => number) => void;
  paginated: boolean;
}

/** 条目列表主体：卡片网格或表格，两种视图共用同一份选择/批量接线 */
export function EntryListPanel({
  pagedEntries,
  viewMode,
  selectedUid,
  onSelect,
  onToggleEnabled,
  onDelete,
  batchMode,
  batchSelected,
  onBatchToggle,
  showFilteredEmpty,
  page,
  totalPages,
  onPageChange,
  paginated,
}: EntryListPanelProps) {
  const rowProps = (key: string) => ({
    entryKey: key,
    selected: selectedUid === key,
    onClick: () => onSelect(key),
    onToggleEnabled: (v: boolean) => onToggleEnabled(key, v),
    onDelete: () => onDelete(key),
    batchMode,
    batchChecked: batchSelected.has(key),
    onBatchToggle: (v: boolean, shift?: boolean) => onBatchToggle(key, v, shift),
  });

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="p-4 space-y-3">
        {viewMode === 'card' ? (
          <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
            {pagedEntries.map(([key, entry]) => (
              <EntryCard key={key} entry={entry} {...rowProps(key)} />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  {batchMode && <th className="px-2 py-1.5 w-8">选</th>}
                  <th className="px-2 py-1.5">启用</th>
                  <th className="px-2 py-1.5">策略</th>
                  <th className="px-2 py-1.5">标题</th>
                  <th className="px-2 py-1.5">关键词</th>
                  <th className="px-2 py-1.5">位置</th>
                  <th className="px-2 py-1.5 text-right">Order</th>
                  {!batchMode && <th className="px-2 py-1.5 w-8"></th>}
                </tr>
              </thead>
              <tbody>
                {pagedEntries.map(([key, entry]) => (
                  <EntryListRow key={key} entry={entry} {...rowProps(key)} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showFilteredEmpty && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            没有匹配的条目，尝试调整筛选条件
          </div>
        )}

        {paginated && totalPages > 1 && (
          <EntryPagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
        )}
      </div>
    </ScrollArea>
  );
}
