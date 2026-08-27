import type { ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface HelpHintProps {
  /** 提示正文，短句为宜；成段的说明用 HelpCard（点开的 popover）。 */
  children: ReactNode;
  /** 读屏用的按钮名，描述这是谁的说明，如「类型说明」。 */
  label: string;
  /** 图标尺寸，跟随所在行的字号；默认 14px（h-3.5）。 */
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * 密集行里的「?」提示。
 *
 * 用它替代给 span 挂原生 `title`：原生 tooltip 在 WebView2 下不可靠，
 * 且键盘和读屏都摸不到；挂在 button 内部的 span 上更是永远不触发
 * （悬浮命中的是外层 button）。触发器是真 button，hover 与 focus 都能出。
 *
 * 自带 TooltipProvider：App.tsx 虽已全局挂了一个，但组件单测常单独渲染，
 * 没有 Provider 时 Radix 会直接抛错。两者都是默认配置，嵌套不改变行为。
 */
export function HelpHint({ children, label, className, side = 'top' }: HelpHintProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label={label} className="shrink-0 cursor-help leading-none">
            <HelpCircle className={cn('h-3.5 w-3.5', className)} />
          </button>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs text-xs leading-relaxed">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
