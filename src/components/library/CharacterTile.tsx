import type { ReactNode } from 'react';
import { MessageSquare } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { CharacterPortrait } from '@/components/library/CharacterPortrait';
import { displayCharacterName } from '@/lib/library-query';
import { introOf } from '@/lib/character-intro';
import { formatFullTime, formatListTime } from '@/lib/time-display';
import { cn } from '@/lib/utils';
import type { ArchiveCharacter } from '@/types/archive';

/** 卡面上方左侧的「评分 + 时间」胶囊；首页与角色库共用同一形态 */
function RatingTimeBadge({ rating, timestamp }: { rating?: number; timestamp: number }) {
  return (
    <span className="flex items-center gap-1.5 px-2 py-[3px] rounded-full text-[11px] bg-[rgba(0,0,0,0.65)] backdrop-blur-sm border border-[rgba(255,255,255,0.12)] min-w-0">
      <b className="font-semibold text-[color:var(--brand-hi)]">{rating !== undefined ? rating : '未评分'}</b>
      <span className="text-white/70 truncate" title={formatFullTime(timestamp)}>
        {formatListTime(timestamp)}
      </span>
    </span>
  );
}

/** 卡面上方右侧的故事数角标（对比度已修正，勿改底色） */
function StoryCountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span data-story-count className={cn(
      'text-[11px] px-2 py-[3px] rounded-full bg-[rgba(0,0,0,0.65)] backdrop-blur-sm text-white border border-[rgba(255,255,255,0.12)] flex items-center gap-1',
      className,
    )}>
      <MessageSquare className="w-3 h-3" />
      {count}
    </span>
  );
}

interface CharacterTileProps {
  character: ArchiveCharacter;
  storyCount: number;
  /** 卡面左上角显示的时间：角色库=最后游玩，首页=最后查看 */
  timestamp: number;
  /** 名称与简介字号（px）；首页固定值，角色库跟随外观里的字体缩放 */
  nameSize: number;
  introSize: number;
  /** 无立绘时首字水印的字号；不传用 CSS 默认值 */
  markFontSize?: number | 'default';
  /** 外层尺寸/定位类名，由使用场景决定（网格由 grid 撑开，横滑列自带宽度） */
  className?: string;
  onActivate: (shiftKey: boolean) => void;
  /** 批量模式：左上角换成勾选框，菜单隐藏 */
  batchMode?: boolean;
  selected?: boolean;
  /** 操作菜单；首页横滑列不给 */
  actions?: ReactNode;
  /** 透传给外层节点的 data-* 标识 */
  dataAttrs?: Record<string, string | undefined>;
}

/**
 * 2:3 立绘卡片。角色库网格卡与首页「最近角色」横滑列原本是两份手抄。
 *
 * 红线：2:3 比例（ST 标准卡 400×600）不可改、不加左上角编号。
 */
export function CharacterTile({
  character: c, storyCount, timestamp, nameSize, introSize, markFontSize = 'default', className,
  onActivate, batchMode = false, selected = false, actions, dataAttrs,
}: CharacterTileProps) {
  const displayName = displayCharacterName(c);
  const intro = introOf(c);

  return (
    <div
      role="button"
      tabIndex={0}
      data-character-id={c.id}
      data-selected={batchMode && selected ? 'true' : undefined}
      {...dataAttrs}
      className={cn(
        'group relative aspect-[2/3] rounded-xl overflow-hidden cursor-pointer bg-elevated transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-canvas)]',
        batchMode && selected && 'ring-2 ring-primary',
        className,
      )}
      onClick={(e) => onActivate(e.shiftKey)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate(e.shiftKey);
        }
      }}
    >
      {/* 立绘满铺；无图用渐变占位 + 首字水印；NSFW 按设置模糊，hover 揭示 */}
      <CharacterPortrait
        character={c}
        className="group-hover:blur-none group-hover:scale-100"
        markFontSize={markFontSize}
      />

      {/* 顶部角标条：左=批量勾选 或 评分+时间；右=故事数 + 菜单 */}
      <div className="absolute top-0 left-0 right-0 z-10 flex justify-between items-start px-2.5 py-2 gap-1.5">
        {batchMode ? (
          <span onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={selected} onCheckedChange={() => onActivate(false)} />
          </span>
        ) : (
          <RatingTimeBadge rating={c.rating} timestamp={timestamp} />
        )}
        <span className="flex items-center gap-1.5 shrink-0">
          <StoryCountBadge count={storyCount} />
          {!batchMode && actions}
        </span>
      </div>

      {/* 底部渐变信息条：只留名称（tooltip）+ 清洗简介 */}
      <div className="absolute left-0 right-0 bottom-0 z-10 px-3.5 pb-3 pt-12 bg-[linear-gradient(transparent,rgba(0,0,0,0.75)_40%,rgba(0,0,0,0.92))]">
        <p
          className="font-serif font-semibold text-white tracking-wide truncate [text-shadow:0_1px_4px_rgba(0,0,0,0.5)]"
          style={{ fontSize: nameSize }}
          title={displayName}
        >
          {displayName}
        </p>
        {intro && (
          <p className="leading-snug text-white/70 line-clamp-2 mt-1" style={{ fontSize: introSize }}>
            {intro}
          </p>
        )}
      </div>
    </div>
  );
}

export { RatingTimeBadge, StoryCountBadge };
