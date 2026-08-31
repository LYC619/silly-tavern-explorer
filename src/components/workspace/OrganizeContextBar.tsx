import { ArrowLeft, BookOpenText } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface OrganizeContextBarProps {
  storyTitle: string;
  backLabel: string;
  onBack: () => void;
  onRead: () => void;
  /**
   * 收掉「阅读与编辑」出口。窄屏在阅读视图也要这条（二级栏进了抽屉，
   * 页面上否则连故事名都没有），但那时按这个按钮不会有任何变化。
   */
  hideReadAction?: boolean;
}

/** 宽二级栏隐藏时保留故事上下文与两个必要出口。 */
export function OrganizeContextBar({ storyTitle, backLabel, onBack, onRead, hideReadAction }: OrganizeContextBarProps) {
  return (
    <header
      className="flex h-11 w-full shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur-sm"
      data-organize-context-bar
    >
      <Button variant="ghost" size="sm" className="px-2 text-muted-foreground" onClick={onBack}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        <span className="max-w-40 truncate" title={backLabel}>{backLabel}</span>
      </Button>
      <span className="h-4 w-px bg-border" aria-hidden="true" />
      <p className="min-w-0 flex-1 truncate text-sm font-medium" title={storyTitle}>{storyTitle}</p>
      {!hideReadAction && (
        <Button variant="outline" size="sm" className="shrink-0" onClick={onRead}>
          <BookOpenText className="mr-1.5 h-4 w-4" />
          阅读与编辑
        </Button>
      )}
    </header>
  );
}
