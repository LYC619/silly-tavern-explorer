import { useTheme } from 'next-themes';
import { Palette, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { THEMES, themeSwatchBackground } from '@/lib/theme';

/** 主题选择弹层（交接包定稿：点开弹层选择，不做小圆点组）。trigger 可注入自定义触发器（侧栏 side-item 用） */
export function ThemeSwitcher({
  side = 'right',
  trigger,
}: {
  side?: 'top' | 'right' | 'bottom' | 'left';
  trigger?: React.ReactNode;
}) {
  const { theme, setTheme } = useTheme();
  return (
    <Popover>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon" title="主题" aria-label="切换主题">
            <Palette className="w-4 h-4" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent side={side} align="end" className="w-44 p-2">
        <div className="text-xs text-muted-foreground px-2 pb-1.5">主题</div>
        <div className="flex flex-col gap-0.5">
          {THEMES.map((t) => (
            <button
              key={t.key}
              onClick={() => setTheme(t.key)}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-left hover:bg-accent transition-colors',
                theme === t.key && 'text-primary font-medium'
              )}
            >
              <span
                className="w-4 h-4 rounded-full border border-border shrink-0 shadow-inner"
                style={{ background: themeSwatchBackground(t) }}
                data-theme-swatch={t.key}
              />
              <span className="flex-1">{t.label}</span>
              {theme === t.key && <Check className="w-3.5 h-3.5" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
