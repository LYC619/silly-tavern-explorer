import { Clock3, Link2, Link2Off } from 'lucide-react';
import type { ArchiveStory } from '@/types/archive';
import { cn } from '@/lib/utils';

interface RecentStoryBarProps {
  stories: ArchiveStory[];
  activeStoryId: string | null;
  onSelect: (story: ArchiveStory) => void;
  className?: string;
}

export function RecentStoryBar({ stories, activeStoryId, onSelect, className }: RecentStoryBarProps) {
  if (stories.length === 0) return null;

  return (
    <section
      aria-label="最近故事"
      className={cn(
        'flex shrink-0 items-center gap-2 border-b border-[color:var(--border-subtle)] bg-chrome/70 px-3 py-2',
        className,
      )}
    >
      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-[color:var(--text-muted)]">
        <Clock3 className="h-3.5 w-3.5" />
        最近故事
      </span>
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin">
        {stories.map((story) => {
          const active = story.id === activeStoryId;
          const LinkIcon = story.characterId ? Link2 : Link2Off;
          return (
            <button
              key={story.id}
              type="button"
              onClick={() => onSelect(story)}
              aria-current={active ? 'page' : undefined}
              title={`${story.title} · ${story.session.messages.length} 楼 · ${story.characterId ? '已绑定角色' : '未绑定角色'}`}
              className={cn(
                'flex max-w-56 shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors',
                active
                  ? 'border-[color:var(--brand-hairline)] bg-[var(--brand-active-bg)] text-brand'
                  : 'border-[color:var(--border-normal)] bg-elevated text-[color:var(--text-body)] hover:bg-elevated-strong',
              )}
            >
              <LinkIcon className="h-3 w-3 shrink-0 opacity-70" />
              <span className="truncate">{story.title || '未命名故事'}</span>
              <span className="shrink-0 text-[10px] opacity-60">{story.session.messages.length} 楼</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
