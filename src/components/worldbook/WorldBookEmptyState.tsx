import { FolderOpen, Globe } from 'lucide-react';
import { WorldBookImporter } from '@/components/worldbook/WorldBookImporter';
import { StagedWorldBookList } from '@/components/worldbook/StagedWorldBookList';
import type { WorldBook, WorldBookItem } from '@/types/worldbook';

interface WorldBookEmptyStateProps {
  savedItems: WorldBookItem[];
  onImport: (wb: WorldBook, name: string, sourceModifiedAt?: number) => void;
  onRestore: (item: WorldBookItem) => void;
  onDelete: (item: WorldBookItem) => void;
}

/** 尚未载入世界书时的引导页：导入入口 + 从本地恢复 */
export function WorldBookEmptyState({ savedItems, onImport, onRestore, onDelete }: WorldBookEmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-4 px-4 max-w-lg w-full">
        <Globe className="w-16 h-16 mx-auto text-muted-foreground/40" />
        <h2 className="text-xl font-semibold text-foreground">开始使用世界书编辑器</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          导入 SillyTavern 的世界书 JSON 文件，可视化浏览和编辑所有条目，然后导出为兼容格式。
        </p>
        <WorldBookImporter onImport={onImport} />

        {savedItems.length > 0 && (
          <div className="mt-8 text-left space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <FolderOpen className="w-4 h-4" />
              从本地恢复
            </div>
            <StagedWorldBookList items={savedItems} variant="card" onSelect={onRestore} onDelete={onDelete} />
          </div>
        )}
      </div>
    </div>
  );
}
