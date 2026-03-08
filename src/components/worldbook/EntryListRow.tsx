import { Switch } from '@/components/ui/switch';
import type { WorldBookEntry } from '@/types/worldbook';
import { POSITION_LABELS } from '@/types/worldbook';
import { cn } from '@/lib/utils';

interface Props {
  entry: WorldBookEntry;
  selected: boolean;
  onClick: () => void;
  onToggleEnabled: (enabled: boolean) => void;
}

function strategyIcon(entry: WorldBookEntry) {
  if (entry.constant) return '🔵';
  if (entry.vectorized) return '🔗';
  return '🟢';
}

export function EntryListRow({ entry, selected, onClick, onToggleEnabled }: Props) {
  return (
    <tr
      className={cn(
        'cursor-pointer hover:bg-accent/50 transition-colors text-sm',
        selected && 'bg-accent'
      )}
      onClick={onClick}
    >
      <td className="px-2 py-1.5 w-10" onClick={(e) => e.stopPropagation()}>
        <Switch checked={entry.enabled} onCheckedChange={onToggleEnabled} className="scale-75" />
      </td>
      <td className="px-2 py-1.5 w-8 text-center">{strategyIcon(entry)}</td>
      <td className="px-2 py-1.5 font-medium truncate max-w-[200px]">
        {entry.comment || '(无标题)'}
      </td>
      <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[200px]">
        {entry.key.join(', ')}
      </td>
      <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">
        {POSITION_LABELS[entry.position] ?? `${entry.position}`}
      </td>
      <td className="px-2 py-1.5 text-muted-foreground text-right">{entry.order}</td>
    </tr>
  );
}
