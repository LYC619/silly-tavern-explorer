import { cn } from '@/lib/utils';

/**
 * 骨架占位块。
 *
 * 首屏用骨架而不是「加载中…」文字，是因为读档要等 IndexedDB，
 * 一行居中文字换成卡墙的瞬间整页会跳一下；骨架把版面先占住，数据到了只是填色。
 * 动画统一用 Tailwind 自带的 animate-pulse，不额外加 shimmer keyframe。
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-skeleton
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-elevated-strong', className)}
      {...props}
    />
  );
}

/**
 * 卡墙骨架：跟真卡一样 2:3 图 + 名字行 + 简介行，列宽由外面的 gridTemplateColumns 决定。
 */
export function CharacterGridSkeleton({
  count = 8,
  gridTemplateColumns,
}: {
  count?: number;
  gridTemplateColumns?: string;
}) {
  return (
    <div className="grid gap-3.5 content-start" style={{ gridTemplateColumns }} data-character-grid-skeleton>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="aspect-[2/3] w-full rounded-xl" />
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/**
 * 故事/条目列表骨架：缩略图 + 两行文字，高度对齐真实行。
 */
export function StoryListSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)} data-story-list-skeleton>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2.5 rounded-lg bg-chrome px-3 py-2.5"
        >
          <Skeleton className="aspect-[3/4] h-11 shrink-0 rounded" />
          <div className="min-w-0 flex-1 flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 顶部刷新指示条：刷新（已经有数据）时用它，不要把已读到的内容换回骨架。
 * 挂在滚动容器外层，sticky 贴顶，够细，不占版面。
 */
export function RefreshIndicator({ active, className }: { active: boolean; className?: string }) {
  if (!active) return null;
  return (
    <div
      data-refresh-indicator
      role="status"
      aria-label="正在刷新"
      className={cn('sticky top-0 z-20 h-0.5 overflow-hidden bg-elevated-strong', className)}
    >
      <div className="h-full w-1/3 animate-pulse rounded-full bg-brand" />
    </div>
  );
}
