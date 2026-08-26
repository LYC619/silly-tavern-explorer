import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * 三档高度，和按钮共用一套栅格（见 docs/ui-conventions.md）：
 *   sm 28px — 紧凑区域：工具栏、表格内、行内小字段，配纯图标按钮（也是 28）
 *   md 32px — 默认，配带文字按钮（也是 32）
 *   lg 36px — 表单主体区域，配 size="lg" 的按钮
 * 同一行里的输入框和按钮必须同档，不要一个 sm 一个默认。
 *
 * 字号刻意写成 text-base md:text-*：iOS Safari 会在字号小于 16px 的输入框
 * 获得焦点时整页放大，移动端必须留在 16px，桌面端才压到紧凑档。
 */
const inputVariants = cva(
  "flex w-full rounded-md border border-input bg-background ring-offset-background file:border-0 file:bg-transparent file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      size: {
        sm: "h-7 px-2 text-base file:text-xs md:text-xs",
        md: "h-8 px-3 text-base file:text-sm md:text-sm",
        lg: "h-9 px-3 text-base file:text-sm md:text-sm",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

/** 原生 input 的 size 是数字（字符宽度），这里要用它表达高度档，所以先 Omit 掉。 */
export interface InputProps
  extends Omit<React.ComponentProps<"input">, "size">,
    VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(inputVariants({ size }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
