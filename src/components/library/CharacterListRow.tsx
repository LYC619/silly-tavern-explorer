import type { ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { CharacterPortrait } from '@/components/library/CharacterPortrait';
import { libraryListColumns } from '@/components/library/library-list-columns';
import { displayCharacterName } from '@/lib/library-query';
import { introOf } from '@/lib/character-intro';
import { formatFullTime, formatListTime } from '@/lib/time-display';
import { cn } from '@/lib/utils';
import type { ArchiveCharacter } from '@/types/archive';

interface CharacterListRowProps {
  character: ArchiveCharacter;
  storyCount: number;
  /** 最后游玩时间，没有则回退到更新时间 */
  timestamp: number;
  nameSize: number;
  introSize: number;
  onActivate: (shiftKey: boolean) => void;
  batchMode: boolean;
  selected: boolean;
  actions: ReactNode;
}

/** 列表视图的一行：小缩略图 + 名字/简介 + 评分/故事数/时间 + 菜单 */
export function CharacterListRow({
  character: c, storyCount, timestamp, nameSize, introSize,
  onActivate, batchMode, selected, actions,
}: CharacterListRowProps) {
  const displayName = displayCharacterName(c);
  const intro = introOf(c);

  return (
    <div
      role="button"
      tabIndex={0}
      data-character-id={c.id}
      data-selected={batchMode && selected ? 'true' : undefined}
      className={cn(
        'grid items-center gap-3.5 px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-[var(--hover-overlay)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-canvas)]',
        batchMode && selected && 'bg-[var(--brand-active-bg)]',
      )}
      style={{ gridTemplateColumns: libraryListColumns(batchMode) }}
      onClick={(e) => onActivate(e.shiftKey)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate(e.shiftKey);
        }
      }}
    >
      {batchMode && (
        <span className="justify-self-center" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={selected} onCheckedChange={() => onActivate(false)} />
        </span>
      )}
      <div className="h-[63px] w-[42px] rounded-md overflow-hidden bg-elevated relative">
        <CharacterPortrait character={c} />
      </div>
      <div className="min-w-0">
        <p
          className="font-medium text-[color:var(--text-primary)] truncate"
          style={{ fontSize: nameSize }}
          title={displayName}
        >
          {displayName}
        </p>
        <p
          className={cn(
            'leading-snug line-clamp-1 mt-0.5',
            intro ? 'text-[color:var(--text-muted)]' : 'text-[color:var(--text-faint)]',
          )}
          style={{ fontSize: introSize }}
          title={intro ?? '暂无简介'}
        >
          {intro ?? '暂无简介'}
        </p>
      </div>
      <span className="text-right text-xs font-semibold text-[color:var(--brand-hi)]">
        {c.rating !== undefined ? c.rating : <span className="font-normal text-[color:var(--text-faint)]">未评分</span>}
      </span>
      <span className="text-right text-xs text-[color:var(--text-muted)]">
        {storyCount > 0 ? `${storyCount} 段故事` : '—'}
      </span>
      <span className="text-right text-xs text-[color:var(--text-faint)]" title={formatFullTime(timestamp)}>
        {formatListTime(timestamp)}
      </span>
      <div className="flex justify-end">{actions}</div>
    </div>
  );
}
