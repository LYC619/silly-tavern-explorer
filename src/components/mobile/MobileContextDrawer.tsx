/**
 * 右侧滑出抽屉：承载「当前内容的上下文」，与左抽屉的「去哪儿」分工。
 *
 * 分左右两个抽屉是 Obsidian 移动版的分法，照搬的理由是这两类东西的生命周期不同：
 * 左边是导航，任何页面都一样，属于外壳；右边是当前打开的这份内容自己的东西
 * （故事的分支/章节/书签/大纲），换一篇就全变，属于页面。混在一个抽屉里
 * 用户每次都要先分辨「这一屏是哪一种」。
 *
 * 这里刻意不复用 MobileDrawer：那个组件带着一级区域子导航、页面插槽、
 * 底部文件库/主题/设置三段固定结构，右抽屉一段都不需要。共用会变成
 * 一堆互斥条件，两边都读不顺。共用的是 ui/sheet 和手势阈值常量。
 */
import { useRef } from 'react';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { isRightDrawerCloseSwipe } from '@/lib/mobile-nav';

interface MobileContextDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 标题：写当前这份内容是什么（故事名），不是写「上下文」这种类别词 */
  title: string;
  description?: string;
  children?: React.ReactNode;
}

export function MobileContextDrawer({
  open, onOpenChange, title, description, children,
}: MobileContextDrawerProps) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-mobile-context-drawer
        className="flex w-[86vw] max-w-[320px] flex-col gap-0 p-0 sm:max-w-[320px]"
        onTouchStart={(event) => {
          const touch = event.changedTouches[0];
          touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          const touch = event.changedTouches[0];
          touchStart.current = null;
          if (!start || !touch) return;
          if (isRightDrawerCloseSwipe({ startX: start.x, startY: start.y, endX: touch.clientX, endY: touch.clientY })) {
            onOpenChange(false);
          }
        }}
      >
        <SheetHeader className="shrink-0 border-b border-[color:var(--border-subtle)] px-4 py-3 text-left">
          <SheetTitle className="truncate text-base" title={title}>{title}</SheetTitle>
          <SheetDescription className="text-xs">
            {description ?? '当前内容的分支、章节与书签'}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 scrollbar-thin">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
