/**
 * 移动端阅读设置（底部弹层）。
 *
 * 纯展示：值和 setter 全部由 NovelView 传进来，持久化、分页、进度都留在那边，
 * 这里只负责把「翻页/滚动、字号、主题、用户楼层、场景分隔符」摆成一屏能点的样子。
 *
 * 桌面端不用这个组件——顶栏的 Popover 一直在，换成弹层反而多一次点击。
 */
import { useTheme } from 'next-themes';
import { Check, ScrollText, BookOpen } from 'lucide-react';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { THEMES, themeSwatchBackground } from '@/lib/theme';
import type { UserFloorMode } from '@/lib/novel-view';

export type ReadingMode = 'page' | 'scroll';

export const MIN_READER_FONT = 14;
export const MAX_READER_FONT = 24;

const USER_MODES: Array<{ key: UserFloorMode; label: string; hint: string }> = [
  { key: 'weaken', label: '弱化', hint: '缩进变浅、字号略小' },
  { key: 'hide', label: '隐藏', hint: 'AI 楼通常会复述，几乎不丢信息' },
  { key: 'keep', label: '保留', hint: '原样显示' },
];

const SCENE_GAPS = [0, 15, 30, 60];

interface MobileReaderSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readingMode: ReadingMode;
  onReadingModeChange: (mode: ReadingMode) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  userMode: UserFloorMode;
  onUserModeChange: (mode: UserFloorMode) => void;
  sceneGap: number;
  onSceneGapChange: (minutes: number) => void;
  showHidden: boolean;
  onShowHiddenChange: (show: boolean) => void;
}

/** 分段控件：一排等宽按钮，比 Select 在拇指范围内好点。 */
function Segmented<T extends string | number>({
  label, value, options, onChange,
}: {
  label: string;
  value: T;
  options: Array<{ key: T; label: string; hint?: string }>;
  onChange: (next: T) => void;
}) {
  const activeHint = options.find((option) => option.key === value)?.hint;
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium">{label}</div>
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {options.map((option) => (
          <button
            key={String(option.key)}
            type="button"
            aria-pressed={option.key === value}
            onClick={() => onChange(option.key)}
            className={cn(
              'tap-target flex-1 rounded-md px-2 text-sm transition-colors',
              option.key === value
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {activeHint && <p className="mt-1.5 text-[11px] text-muted-foreground">{activeHint}</p>}
    </div>
  );
}

export function MobileReaderSettings({
  open,
  onOpenChange,
  readingMode,
  onReadingModeChange,
  fontSize,
  onFontSizeChange,
  userMode,
  onUserModeChange,
  sceneGap,
  onSceneGapChange,
  showHidden,
  onShowHiddenChange,
}: MobileReaderSettingsProps) {
  const { theme, setTheme } = useTheme();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        data-reader-settings
        className="max-h-[85vh] gap-0 overflow-y-auto rounded-t-xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="mb-3 text-left">
          <SheetTitle className="text-base">阅读设置</SheetTitle>
          <SheetDescription className="text-xs">改动即时生效，下次打开沿用。</SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          <Segmented
            label="阅读方式"
            value={readingMode}
            onChange={onReadingModeChange}
            options={[
              { key: 'scroll' as ReadingMode, label: '滚动', hint: '一路往下读，章节之间有分隔' },
              { key: 'page' as ReadingMode, label: '翻页', hint: '左右滑或点两侧翻页' },
            ]}
          />

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium">字号</span>
              <span className="text-xs tabular-nums text-muted-foreground">{fontSize}px</span>
            </div>
            <Slider
              value={[fontSize]}
              onValueChange={([value]) => onFontSizeChange(value)}
              min={MIN_READER_FONT}
              max={MAX_READER_FONT}
              step={1}
              aria-label="正文字号"
            />
          </div>

          <div>
            <div className="mb-1.5 text-sm font-medium">主题</div>
            <div className="flex gap-2">
              {THEMES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTheme(item.key)}
                  aria-label={item.label}
                  aria-pressed={theme === item.key}
                  title={item.label}
                  className={cn(
                    'tap-target relative flex flex-1 flex-col items-center gap-1 rounded-lg border p-2 transition-colors',
                    theme === item.key ? 'border-primary' : 'border-border',
                  )}
                >
                  <span
                    className="h-7 w-7 rounded-full border border-border shadow-inner"
                    style={{ background: themeSwatchBackground(item) }}
                    data-theme-swatch={item.key}
                  />
                  <span className="max-w-full truncate text-[11px] text-muted-foreground">{item.label}</span>
                  {theme === item.key && (
                    <Check className="absolute right-1 top-1 h-3 w-3 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <Segmented
            label="用户楼层"
            value={userMode}
            onChange={onUserModeChange}
            options={USER_MODES}
          />

          <Segmented
            label="场景分隔符"
            value={sceneGap}
            onChange={onSceneGapChange}
            options={SCENE_GAPS.map((minutes) => ({
              key: minutes,
              label: minutes === 0 ? '关闭' : `${minutes} 分`,
              hint: minutes === 0
                ? '不插入 ✦ ✦ ✦'
                : `楼层间隔超过 ${minutes} 分钟时插入 ✦ ✦ ✦`,
            }))}
          />

          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <Label htmlFor="mobile-reader-show-hidden" className="text-sm">显示隐藏楼层</Label>
            <Checkbox
              id="mobile-reader-show-hidden"
              checked={showHidden}
              onCheckedChange={(checked) => onShowHiddenChange(Boolean(checked))}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** 首次进入的分区提示：翻页模式讲三分区，滚动模式只讲中间那一下。 */
export function ReaderZoneHint({ mode, onDismiss }: { mode: ReadingMode; onDismiss: () => void }) {
  return (
    <div
      data-reader-zone-hint
      role="button"
      tabIndex={0}
      aria-label="知道了，关闭操作提示"
      onClick={onDismiss}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onDismiss(); }}
      className="absolute inset-0 z-30 flex flex-col bg-black/70 text-white backdrop-blur-[1px]"
    >
      {mode === 'page' ? (
        <div className="flex flex-1 divide-x divide-white/25">
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-2 text-center">
            <BookOpen className="h-6 w-6 opacity-80" />
            <span className="text-sm">点这里</span>
            <span className="text-xs opacity-75">上一页</span>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-2 text-center">
            <span className="text-sm">点中间</span>
            <span className="text-xs opacity-75">显示 / 收起工具栏</span>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-2 text-center">
            <BookOpen className="h-6 w-6 opacity-80" />
            <span className="text-sm">点这里</span>
            <span className="text-xs opacity-75">下一页</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <ScrollText className="h-7 w-7 opacity-80" />
          <span className="text-sm">上下滑动读正文</span>
          <span className="text-xs opacity-75">点一下屏幕中间，显示或收起工具栏</span>
        </div>
      )}
      <p className="pb-8 text-center text-xs opacity-70">点任意位置关闭本提示</p>
    </div>
  );
}
