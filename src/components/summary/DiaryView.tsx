import { BookHeart } from 'lucide-react';
import { parseDiary } from '@/lib/diary-parser';

interface DiaryViewProps {
  content: string;
  /** 角色名，用于署名区兜底 */
  charName?: string;
}

/**
 * 日记本样式渲染：把角色日记文本解析为条目，用纸张感 / 衬线字体分层展示日期·标题·正文。
 * 解析失败（无结构）时回退为整段文本。
 */
export function DiaryView({ content, charName }: DiaryViewProps) {
  const { entries, signature, raw } = parseDiary(content);

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border bg-[hsl(40_30%_97%)] dark:bg-muted/30 p-5 font-serif whitespace-pre-wrap text-sm leading-relaxed">
        {raw || '（暂无内容）'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {entries.map((e, i) => (
        <div
          key={i}
          className="rounded-lg border bg-[hsl(40_30%_97%)] dark:bg-muted/30 shadow-sm overflow-hidden"
        >
          {/* 顶部：日期 + 装订感竖线 */}
          <div className="border-l-4 border-primary/40 px-5 py-4 font-serif">
            <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
              {e.title && (
                <h3 className="text-lg font-semibold flex items-center gap-1.5">
                  <BookHeart className="w-4 h-4 text-primary/70" />
                  {e.title}
                </h3>
              )}
              {e.date && <span className="text-xs text-muted-foreground italic">{e.date}</span>}
            </div>
            <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
              {e.body}
            </div>
          </div>
        </div>
      ))}
      {(signature || charName) && (
        <div className="text-right font-serif italic text-sm text-muted-foreground pr-2">
          —— {signature || charName}
        </div>
      )}
    </div>
  );
}
