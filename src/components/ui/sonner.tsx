import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";
import { isDarkTheme } from "@/lib/theme";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={isDarkTheme(theme) ? "dark" : "light"}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

// toast 不从这里转发：唯一调用方 lib/register-sw.ts 直接 import from 'sonner'
// （两个 Toaster 并存的原因见 docs/ui-conventions.md 第五节）
export { Toaster };
