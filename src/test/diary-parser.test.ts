import { describe, it, expect } from 'vitest';
import { parseDiary } from '@/lib/diary-parser';

describe('parseDiary', () => {
  it('解析 <diary> 包裹的多篇日记', () => {
    const text = `<diary datetime="2026/07/04 20:00">
开场白，情绪基调。

2026/07/04
**难忘的一天**
今天发生了很多事，我感到既紧张又期待。

---

2026/07/05
**平静的午后**
喝了杯茶，想起昨天的事。

—— 爱丽丝
</diary>`;
    const r = parseDiary(text);
    expect(r.entries.length).toBeGreaterThanOrEqual(2);
    const titles = r.entries.map((e) => e.title);
    expect(titles).toContain('难忘的一天');
    expect(titles).toContain('平静的午后');
    const first = r.entries.find((e) => e.title === '难忘的一天')!;
    expect(first.date).toBe('2026/07/04');
    expect(first.body).toContain('今天发生了很多事');
  });

  it('提取署名', () => {
    const text = `**标题**\n正文\n\n---\n\n—— 鲍勃`;
    const r = parseDiary(text);
    expect(r.signature).toBe('鲍勃');
  });

  it('剥 markdown 围栏', () => {
    const text = '```html\n<diary>\n**日**\n内容\n</diary>\n```';
    const r = parseDiary(text);
    expect(r.entries[0].title).toBe('日');
  });

  it('无 diary 标签也能解析裸文本', () => {
    const text = `2026-01-01\n**元旦**\n新年第一天`;
    const r = parseDiary(text);
    expect(r.entries[0].title).toBe('元旦');
    expect(r.entries[0].date).toBe('2026-01-01');
  });

  it('空文本返回空 entries + raw', () => {
    const r = parseDiary('');
    expect(r.entries).toEqual([]);
    expect(r.raw).toBe('');
  });

  it('无结构文本仍不崩（entries 可空，raw 保留）', () => {
    const r = parseDiary('就是一段普通文字没有任何日记结构');
    expect(r.raw).toContain('普通文字');
  });
});
