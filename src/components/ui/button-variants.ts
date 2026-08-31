/**
 * Button 的 cva 配方单独成文件，不跟组件同居。
 *
 * 原因是 react-refresh：一个文件同时导出组件和非组件，Vite 就没法对它做热替换，
 * 改一次样式整页重载。alert-dialog 需要拿这份配方给 AlertDialogAction 套按钮样式，
 * 所以它不能只在 button.tsx 内部私有。
 */
import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  // tap-target：点击热区兜底到 32×32（见 index.css），对本来就够大的按钮是空操作
  "tap-target inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      /**
       * 高度栅格 28 / 32 / 36，和 Input 三档一一对齐（见 docs/ui-conventions.md）：
       * 纯图标按钮 28（icon），带文字按钮 32（default / sm，差别只在内边距），
       * 表单主体区域 36（lg）。同一行里的按钮和输入框必须同档。
       * 28px 低于 32px 的最小点击区，靠基础样式里的 tap-target 把热区补回去。
       */
      size: {
        default: "h-8 px-3 py-1",
        sm: "h-8 rounded-md px-2.5",
        lg: "h-9 rounded-md px-6",
        icon: "h-7 w-7",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
