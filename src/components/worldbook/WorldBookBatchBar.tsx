import { BatchOperations } from '@/components/worldbook/BatchOperations';
import type { BatchSelection } from '@/hooks/use-batch-selection';
import type { WorldBookItem } from '@/types/worldbook';

interface WorldBookBatchBarProps {
  batch: BatchSelection;
  totalFiltered: number;
  savedItems: WorldBookItem[];
  currentItemId: string | null;
  onBatchDelete: () => void;
  onBatchCopyTo: (targetId: string, move: boolean) => void;
}

/**
 * 批量工具条的接线层。四个批量操作骨架相同——快照、按选中集打补丁、给一条可撤销的
 * toast——差别只在补丁本身，所以统一交给 `applyBatch`，这里只声明每种操作改什么。
 */
export function WorldBookBatchBar({
  batch, totalFiltered, savedItems, currentItemId, onBatchDelete, onBatchCopyTo,
}: WorldBookBatchBarProps) {
  const count = batch.batchSelected.size;
  return (
    <BatchOperations
      selectedKeys={batch.batchSelected}
      totalFiltered={totalFiltered}
      onSelectAll={batch.selectAll}
      onDeselectAll={batch.deselectAll}
      onExitBatch={batch.exitBatchMode}
      onBatchPrefix={(prefix) => batch.applyBatch(
        (e) => (e.comment.startsWith(prefix) ? null : { comment: prefix + e.comment }),
        { title: '前缀已添加', description: `已为 ${count} 个条目添加前缀` },
      )}
      onBatchDelete={onBatchDelete}
      onBatchPosition={(position, depth, role) => batch.applyBatch(
        () => ({
          position,
          ...(depth !== undefined ? { depth } : {}),
          ...(role !== undefined ? { role } : {}),
        }),
        { title: '位置已修改', description: `已修改 ${count} 个条目的插入位置` },
      )}
      onBatchStrategy={(strategy) => batch.applyBatch(
        () => ({ constant: strategy === 'constant', vectorized: strategy === 'vectorized' }),
        { title: '策略已修改', description: `已修改 ${count} 个条目的触发策略` },
      )}
      onBatchEnable={(enabled) => batch.applyBatch(
        () => ({ enabled }),
        {
          title: enabled ? '已启用' : '已停用',
          description: `已${enabled ? '启用' : '停用'} ${count} 个条目`,
        },
      )}
      copyTargets={savedItems.filter((i) => i.id !== currentItemId).map((i) => ({ id: i.id, title: i.title }))}
      onBatchCopyTo={onBatchCopyTo}
    />
  );
}
