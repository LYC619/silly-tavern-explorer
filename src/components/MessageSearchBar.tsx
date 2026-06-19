import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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
  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1">
      <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) onPrev(); else onNext(); }
        }}
        placeholder="搜索正文…"
        className="h-6 w-40 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
        aria-label="搜索消息正文"
      />
      {hasQuery && (
        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground tabular-nums">
          {total > 0 ? `${current}/${total}` : '无结果'}
        </span>
      )}
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onPrev} disabled={total === 0} aria-label="上一个命中">
        <ChevronUp className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onNext} disabled={total === 0} aria-label="下一个命中">
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      {hasQuery && (
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onQueryChange('')} aria-label="清除搜索">
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
