import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useViewport } from '@/hooks/use-viewport';
import { cn } from '@/lib/utils';

interface MessageSearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  /** 命中总数 */
  total: number;
  /** 当前定位第几个命中（1-based，0 表示无） */
  current: number;
  onNext: () => void;
  onPrev: () => void;
}

/** 预览区全文搜索框：补虚拟化后浏览器 Ctrl+F 只能搜可视区的缺口。 */
export function MessageSearchBar({ query, onQueryChange, total, current, onNext, onPrev }: MessageSearchBarProps) {
  const hasQuery = query.trim().length > 0;
  const { isCompact } = useViewport();
  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1">
      <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <Input size="sm"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) onPrev(); else onNext(); }
        }}
        placeholder="搜索正文…"
        /* 窄屏收窄输入框：整条搜索栏在 390px 视口里占掉三分之二，
           而它前后还有外观、小说视图、导出。搜关键词一般就几个字，
           w-24 够看；桌面档保留 w-40。 */
        className={cn(
          'border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0',
          isCompact ? 'w-24' : 'w-40',
        )}
        aria-label="搜索消息正文"
      />
      {hasQuery && (
        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground tabular-nums">
          {total > 0 ? `${current}/${total}` : '无结果'}
        </span>
      )}
      <Button variant="ghost" size="icon" onClick={onPrev} disabled={total === 0} aria-label="上一个命中">
        <ChevronUp className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" onClick={onNext} disabled={total === 0} aria-label="下一个命中">
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      {hasQuery && (
        <Button variant="ghost" size="icon" onClick={() => onQueryChange('')} aria-label="清除搜索">
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
