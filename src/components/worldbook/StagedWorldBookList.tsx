import { Clock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { WorldBookItem } from '@/types/worldbook';

/** 暂存记录的时间：有源文件修改时间就显示源文件的，否则回退到 STE 更新时间 */
function stagedTime(item: WorldBookItem): string {
  return new Date(item.sourceModifiedAt ?? item.updatedAt).toLocaleString();
}

interface StagedWorldBookListProps {
  items: WorldBookItem[];
  onSelect: (item: WorldBookItem) => void;
  onDelete: (item: WorldBookItem) => void;
  /** 'dialog' 用于「已暂存」弹窗，'card' 用于空态里的「从本地恢复」 */
  variant: 'dialog' | 'card';
}

/**
 * 暂存世界书列表。「已暂存」弹窗和空态的「从本地恢复」是同一份数据的两种外观，
 * 标题 / 条目数 / 时间 / 删除四处逻辑共用，避免改一处漏另一处。
 */
export function StagedWorldBookList({ items, onSelect, onDelete, variant }: StagedWorldBookListProps) {
  if (variant === 'dialog') {
    return (
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
            <button className="flex-1 text-left" onClick={() => onSelect(item)}>
              <div className="font-medium text-sm text-foreground">{item.title}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                <span>{Object.keys(item.worldbook.entries).length} 条目</span>
                <span>·</span>
                <span>{stagedTime(item)}</span>
              </div>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete(item); }}
              aria-label="删除暂存"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Card
          key={item.id}
          className="cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => onSelect(item)}
        >
          <CardContent className="p-3 flex items-center justify-between">
            <div className="min-w-0">
              <p className="font-medium text-sm truncate text-foreground">{item.title}</p>
              <p className="text-xs text-muted-foreground">
                {Object.keys(item.worldbook.entries).length} 个条目
                <span className="mx-1">·</span>
                <Clock className="w-3 h-3 inline -mt-0.5" />
                {' '}{stagedTime(item)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label="删除"
              onClick={(e) => { e.stopPropagation(); onDelete(item); }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
