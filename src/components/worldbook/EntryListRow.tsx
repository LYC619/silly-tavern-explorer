import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2 } from 'lucide-react';
import { HoverPreview } from '@/components/HoverPreview';
import type { WorldBookEntry } from '@/types/worldbook';
import { POSITION_LABELS } from '@/types/worldbook';
import { cn } from '@/lib/utils';

interface Props {
  entry: WorldBookEntry;
  /** entries 记录里的键；作为列表项的稳定标识暴露给 DOM */
  entryKey: string;
  selected: boolean;
  onClick: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onDelete?: () => void;
  batchMode?: boolean;
  batchChecked?: boolean;
  onBatchToggle?: (checked: boolean, shiftKey: boolean) => void;
}

function strategyIcon(entry: WorldBookEntry) {
  if (entry.constant) return '🔵';
  if (entry.vectorized) return '🔗';
  return '🟢';
}

/** 关键词格的悬浮内容：主关键词一行，有次要关键词再补一行说明它是「次要」 */
function keywordPreview(entry: WorldBookEntry): string {
  const lines: string[] = [];
  if (entry.key.length > 0) lines.push(entry.key.join('、'));
  if (entry.keysecondary.length > 0) lines.push(`次要关键词：${entry.keysecondary.join('、')}`);
  return lines.join('\n');
}

export function EntryListRow({ entry, entryKey, selected, onClick, onToggleEnabled, onDelete, batchMode, batchChecked, onBatchToggle }: Props) {
  return (
    <tr
      data-entry-key={entryKey}
      data-batch-checked={batchChecked ? 'true' : undefined}
      className={cn(
        'cursor-pointer hover:bg-accent/50 transition-colors text-sm',
        selected && 'bg-accent'
      )}
      onClick={onClick}
    >
      {batchMode && (
        <td className="px-2 py-1.5 w-8" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={batchChecked}
            onClick={(e) => onBatchToggle?.(!batchChecked, (e as React.MouseEvent).shiftKey)}
            className="scale-75"
          />
        </td>
      )}
      <td className="px-2 py-1.5 w-10" onClick={(e) => e.stopPropagation()}>
        <Switch checked={entry.enabled} onCheckedChange={onToggleEnabled} className="scale-75" />
      </td>
      <td className="px-2 py-1.5 w-8 text-center">{strategyIcon(entry)}</td>
      {/* 悬浮预览挂在标题格上，看的是这条的正文——列表里正文根本没露脸，
          鼠标停一下就能读到才是这一格最有用的信息 */}
      <HoverPreview text={entry.content || entry.comment}>
        <td className="px-2 py-1.5 font-medium truncate max-w-[200px]">
          {entry.comment || '(无标题)'}
        </td>
      </HoverPreview>
      {/* 原来这格挂的是 title={entry.content}，可显示的是关键词，对不上；
          关键词一多就被截断，悬浮该给的是**全部**关键词（含次要关键词） */}
      <HoverPreview text={keywordPreview(entry)}>
        <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[200px]">
          {entry.key.join(', ')}
        </td>
      </HoverPreview>
      <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">
        {POSITION_LABELS[entry.position] ?? `${entry.position}`}
      </td>
      <td className="px-2 py-1.5 text-muted-foreground text-right">{entry.order}</td>
      {!batchMode && (
        <td className="px-2 py-1.5 w-8 text-center" onClick={(e) => e.stopPropagation()}>
          {onDelete && (
            <button
              onClick={onDelete}
              className="text-muted-foreground hover:text-destructive transition-colors inline-flex"
              aria-label="删除此条目"
              title="删除此条目"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </td>
      )}
    </tr>
  );
}
