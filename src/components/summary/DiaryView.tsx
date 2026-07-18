import { useEffect, useState } from 'react';
import { BookHeart, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parseDiary } from '@/lib/diary-parser';
import { MarkdownLite } from '@/components/MarkdownLite';

interface DiaryViewProps {
  content: string;
  /** 角色名，用于署名区兜底 */
  charName?: string;
}

/**
 * 日记本渲染：解析出的每篇日记独占一页，像翻日记本一样前后翻页。
 * 支持 ←/→ 键盘翻页；正文走 MarkdownLite（日记里的 **强调** 等标记正常渲染）。
 * 解析失败（无结构）时回退为整段文本。
 */
export function DiaryView({ content, charName }: DiaryViewProps) {
  const { entries, signature, raw } = parseDiary(content);
  const [page, setPage] = useState(0);

  // 内容变化（切换查看另一份日记）时回到第一页，并夹紧页码
  useEffect(() => { setPage(0); }, [content]);
  const safePage = Math.min(page, Math.max(0, entries.length - 1));
  const entry = entries[safePage];

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border bg-[hsl(40_30%_97%)] dark:bg-muted/30 p-5 font-serif whitespace-pre-wrap text-sm leading-relaxed">
        {raw || '（暂无内容）'}
      </div>
    );
  }

  const prev = () => setPage((p) => Math.max(0, p - 1));
  const next = () => setPage((p) => Math.min(entries.length - 1, p + 1));

  return (
    <div
      className="mx-auto max-w-2xl outline-none"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
        if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      }}
    >
      <div className="relative rounded-xl border-2 border-primary/15 bg-[hsl(40_30%_97%)] dark:bg-muted/30 shadow-warm overflow-hidden">
        {/* 装订线 */}
        <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-primary/30 via-primary/10 to-primary/30" />

        {/* 一页一篇：key 换页触发淡入，模拟翻页 */}
        <div key={safePage} className="px-7 sm:px-10 py-7 font-serif animate-fade-in min-h-[44vh] flex flex-col">
          <div className="flex items-baseline justify-between gap-2 mb-3 flex-wrap">
            {entry.title ? (
              <h3 className="text-lg font-semibold flex items-center gap-1.5">
                <BookHeart className="w-4 h-4 text-primary/70" />
                {entry.title}
              </h3>
            ) : <span />}
            {entry.date && <span className="text-xs text-muted-foreground italic shrink-0">{entry.date}</span>}
          </div>

          <MarkdownLite text={entry.body} className="text-[15px] text-foreground/90 flex-1" />

          {/* 署名只落在最后一页，像日记的收笔 */}
          {safePage === entries.length - 1 && (signature || charName) && (
            <div className="text-right italic text-sm text-muted-foreground mt-6">
              —— {signature || charName}
            </div>
          )}
        </div>

        {/* 页脚翻页条 */}
        <div className="flex items-center justify-between border-t border-border/60 bg-background/40 px-3 py-2">
          <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={prev} disabled={safePage === 0}>
            <ChevronLeft className="w-3.5 h-3.5" />上一篇
          </Button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-serif">
            <span>第 {safePage + 1} / {entries.length} 篇</span>
            {entries.length > 1 && entries.length <= 12 && (
              <span className="hidden sm:flex items-center gap-1">
                {entries.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i)}
                    aria-label={`第 ${i + 1} 篇`}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${i === safePage ? 'bg-primary' : 'bg-border hover:bg-primary/40'}`}
                  />
                ))}
              </span>
            )}
          </div>
          <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={next} disabled={safePage === entries.length - 1}>
            下一篇<ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
