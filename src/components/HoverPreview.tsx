import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipPortal, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/** 悬浮预览最多显示这么多字，再长就截断加省略号——tooltip 不能滚，超长了也读不完 */
const PREVIEW_LIMIT = 400;

interface HoverPreviewProps {
  /** 悬浮时要看全的正文；空字符串/undefined 时不套 tooltip，直接渲染 children */
  text?: string;
  /** 被悬浮的元素。用 asChild 直接接管它，不额外套层 DOM。 */
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * 截断文字的悬浮预览。
 *
 * 用它替代给截断元素挂原生 `title`：原生提示的字号由系统定，改不了，
 * 在高分屏上小到看不清（0830 反馈条目 10），而且换行也不受控。
 *
 * 触发器用 asChild 套在原元素上，所以定位跟着**可见的**那个盒子走。
 * 若改成在里面另包一个 span，span 的实际宽度是未截断的全文宽度，
 * tooltip 会飘到格子外面去。
 *
 * 自带 TooltipProvider，与 HelpHint 一致：组件单测常单独渲染，没有 Provider
 * 时 Radix 直接抛错。ponytail: 一行一个 Provider，「全部」页宽有几百个；
 * 单个 Provider 只是几个 ref + context，实测不成瓶颈，真要省就提到
 * EntryListPanel 挂一个（顺带能让相邻行秒开，不用每行重新等延迟）。
 */
export function HoverPreview({ text, children, side = 'top' }: HoverPreviewProps) {
  const body = text?.trim();
  if (!body) return <>{children}</>;

  return (
    <TooltipProvider delayDuration={500}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        {/* 必须传送出去：列表视图的触发器是 <td>，内容留在 <tr> 里会被浏览器提到表格外 */}
        <TooltipPortal>
          <TooltipContent side={side} className="max-w-md text-sm leading-relaxed whitespace-pre-wrap">
            {body.length > PREVIEW_LIMIT ? `${body.slice(0, PREVIEW_LIMIT)}…` : body}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}
