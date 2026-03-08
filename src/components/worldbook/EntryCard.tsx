import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import type { WorldBookEntry } from '@/types/worldbook';
import { POSITION_LABELS } from '@/types/worldbook';
import { cn } from '@/lib/utils';

interface Props {
  entry: WorldBookEntry;
  selected: boolean;
  onClick: () => void;
  onToggleEnabled: (enabled: boolean) => void;
}

function groupColor(group: string): string {
  if (!group) return 'hsl(var(--muted))';
  let hash = 0;
  for (let i = 0; i < group.length; i++) hash = group.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 55%)`;
}

function strategyInfo(entry: WorldBookEntry) {
  if (entry.constant) return { dot: 'bg-blue-500', label: '常驻' };
  if (entry.vectorized) return { dot: 'bg-purple-500', label: '向量' };
  return { dot: 'bg-green-500', label: '关键词' };
}

export function EntryCard({ entry, selected, onClick, onToggleEnabled }: Props) {
  const strategy = strategyInfo(entry);
  const posLabel = POSITION_LABELS[entry.position] ?? `位置 ${entry.position}`;
  const contentPreview = entry.content.split('\n').slice(0, 3).join('\n');

  return (
    <div
      className={cn(
        'relative rounded-lg border bg-card cursor-pointer transition-all overflow-hidden',
        'hover:shadow-md',
        selected && 'ring-2 ring-primary shadow-md'
      )}
      onClick={onClick}
    >
      {/* Left group color bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
        style={{ backgroundColor: groupColor(entry.group) }}
      />

      <div className="pl-4 pr-3 py-3 space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', strategy.dot)} />
            <span className="font-semibold text-sm truncate text-foreground">
              {entry.comment || '(无标题)'}
            </span>
            <span className="text-xs text-muted-foreground shrink-0">{strategy.label}</span>
          </div>
          <Switch
            checked={entry.enabled}
            onCheckedChange={(v) => { onToggleEnabled(v); }}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0"
          />
        </div>

        {/* Keywords */}
        {(entry.key.length > 0 || entry.keysecondary.length > 0) && (
          <div className="flex flex-wrap gap-1">
            {entry.key.map((k, i) => (
              <Badge key={`k-${i}`} variant="secondary" className="text-xs px-1.5 py-0">
                {k}
              </Badge>
            ))}
            {entry.keysecondary.map((k, i) => (
              <Badge
                key={`ks-${i}`}
                variant="outline"
                className="text-xs px-1.5 py-0 border-dashed"
              >
                {k}
              </Badge>
            ))}
          </div>
        )}

        {/* Content preview */}
        {entry.content && (
          <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">
            {contentPreview}
          </p>
        )}

        {/* Footer info */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{posLabel}{entry.position === 6 ? ` · 深度 ${entry.depth}` : ''}</span>
          <span>·</span>
          <span>Order {entry.order}</span>
          {entry.probability < 100 && (
            <>
              <span>·</span>
              <span>{entry.probability}%</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
