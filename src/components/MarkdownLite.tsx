import { memo, type ReactNode } from 'react';

/**
 * 轻量 Markdown 渲染（无依赖、输出 React 元素——不走 innerHTML，天然防 XSS）。
 * 面向本项目 AI 总结的实际产出：#~#### 标题、**粗体**、*斜体*、`行内代码`、
 * -/* 无序列表、1. 有序列表、> 引用、---/*** 分隔线；其余行按段落渲染。
 * ponytail: 不支持表格/嵌套列表/代码块——总结模板不产这些，出现时按普通文本行展示；
 * 需要时再升级 react-markdown。
 */

/** 行内标记：**粗体** / *斜体* / `代码` */
function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2] != null) out.push(<strong key={`${keyBase}b${i++}`} className="font-semibold">{m[2]}</strong>);
    else if (m[3] != null) out.push(<em key={`${keyBase}i${i++}`}>{m[3]}</em>);
    else if (m[4] != null) out.push(<code key={`${keyBase}c${i++}`} className="px-1 py-0.5 rounded bg-muted text-[0.9em] font-mono">{m[4]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const H_CLASS: Record<number, string> = {
  1: 'text-xl font-display font-semibold mt-5 mb-2',
  2: 'text-lg font-semibold mt-4 mb-2 pb-1 border-b border-border/60',
  3: 'text-base font-semibold mt-3.5 mb-1.5 text-primary',
  4: 'text-sm font-semibold mt-3 mb-1',
};

export const MarkdownLite = memo(function MarkdownLite({ text, className }: { text: string; className?: string }) {
  const lines = (text ?? '').split('\n');
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = (key: string) => {
    if (!list) return;
    const items = list.items.map((item, i) => (
      <li key={i} className="leading-relaxed">{renderInline(item, `${key}li${i}`)}</li>
    ));
    blocks.push(
      list.ordered
        ? <ol key={key} className="list-decimal pl-5 space-y-1 my-2">{items}</ol>
        : <ul key={key} className="list-disc pl-5 space-y-1 my-2">{items}</ul>
    );
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    const key = `b${i}`;

    const ulMatch = line.match(/^[-*]\s+(.*)$/);
    const olMatch = line.match(/^\d+[.、]\s+(.*)$/);
    // 分隔线要先于无序列表判断（*** 会被 [-*] 误吃）
    const isHr = /^(-{3,}|\*{3,})$/.test(line);

    if (!isHr && ulMatch) {
      if (list && list.ordered) flushList(key);
      list ??= { ordered: false, items: [] };
      list.items.push(ulMatch[1]);
      continue;
    }
    if (olMatch) {
      if (list && !list.ordered) flushList(key);
      list ??= { ordered: true, items: [] };
      list.items.push(olMatch[1]);
      continue;
    }
    flushList(key);

    if (!line) continue;
    if (isHr) {
      blocks.push(<hr key={key} className="my-4 border-border" />);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      blocks.push(<Tag key={key} className={H_CLASS[level]}>{renderInline(h[2], key)}</Tag>);
      continue;
    }
    if (line.startsWith('> ')) {
      blocks.push(
        <blockquote key={key} className="border-l-2 border-primary/40 pl-3 my-2 text-muted-foreground italic leading-relaxed">
          {renderInline(line.slice(2), key)}
        </blockquote>
      );
      continue;
    }
    blocks.push(<p key={key} className="my-1.5 leading-relaxed">{renderInline(line, key)}</p>);
  }
  flushList('tail');

  return <div className={className}>{blocks}</div>;
});
