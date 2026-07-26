/**
 * 分享图单测（阶段6）：Markdown → 排版行（canvas 绘制部分需真浏览器，冒烟覆盖）。
 */
import { describe, it, expect } from 'vitest';
import { mdToPlainLines } from '@/lib/share-image';

describe('mdToPlainLines', () => {
  it('标题/引用/列表/分隔线分类正确，行内标记剥掉', () => {
    const md = [
      '# 第一卷 - **初遇**',
      '',
      '#### 深层标题',
      '正文段落，含 *斜体* 和 `代码` 与 [链接](http://x)。',
      '> 引用一句',
      '- 列表项',
      '1. 有序项',
      '***',
    ].join('\n');
    const lines = mdToPlainLines(md);
    expect(lines).toEqual([
      { kind: 'h1', text: '第一卷 - 初遇' },
      { kind: 'blank', text: '' },
      { kind: 'h3', text: '深层标题' }, // 4~6 级归到 h3
      { kind: 'text', text: '正文段落，含 斜体 和 代码 与 链接。' },
      { kind: 'quote', text: '引用一句' },
      { kind: 'li', text: '列表项' },
      { kind: 'li', text: '有序项' },
      { kind: 'hr', text: '' },
    ]);
  });

  it('连续空行折叠、首尾空行去除', () => {
    const lines = mdToPlainLines('\n\nA\n\n\n\nB\n\n');
    expect(lines).toEqual([
      { kind: 'text', text: 'A' },
      { kind: 'blank', text: '' },
      { kind: 'text', text: 'B' },
    ]);
  });
});
