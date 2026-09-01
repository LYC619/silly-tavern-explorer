/**
 * 分享图单测（阶段6）：Markdown → 排版行（canvas 绘制部分需真浏览器，冒烟覆盖）。
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  colorLightness, mdToPlainLines, themeHsl, watermarkInk, wrapText, type MeasureText,
} from '@/lib/share-image';

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

describe('wrapText', () => {
  /** 每字符 10px 的假测量器，折行边界就能算准 */
  const perChar10: MeasureText = (text) => [...text].length * 10;

  it('按像素宽折行，不按字符数', () => {
    expect(wrapText(perChar10, 'abcdefgh', 30)).toEqual(['abc', 'def', 'gh']);
  });

  it('单字超宽也不丢字（放不下就自己占一行）', () => {
    expect(wrapText(perChar10, 'abc', 5)).toEqual(['a', 'b', 'c']);
  });

  it('折在空格处时把那个空格吃掉，不让下一行以空格开头', () => {
    expect(wrapText(perChar10, 'ab cd', 20)).toEqual(['ab', 'cd']);
  });

  it('空串返回一个空行，调用方拿到的永远是非空数组', () => {
    expect(wrapText(perChar10, '', 100)).toEqual(['']);
  });

  it('中英混排逐字测量，宽字符不会溢出', () => {
    // 中文按 20px、拉丁按 10px 的更真实一点的测量
    const mixed: MeasureText = (text) => [...text]
      .reduce((sum, ch) => sum + (/[一-龥]/.test(ch) ? 20 : 10), 0);
    expect(wrapText(mixed, '中文abc', 40)).toEqual(['中文', 'abc']);
  });
});

describe('themeHsl', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--test-share-hsl');
  });

  it('拿到裸三元组时包成 hsl()', () => {
    document.documentElement.style.setProperty('--test-share-hsl', '25.6 70.8% 58.4%');
    expect(themeHsl('--test-share-hsl', '#000')).toBe('hsl(25.6 70.8% 58.4%)');
  });

  it('变量没定义时用回退色，而不是造出非法的 hsl()', () => {
    // 拼出 `hsl()` 的话 canvas 会静默忽略并画成黑色——这是原来那版的 bug
    expect(themeHsl('--no-such-var-hsl', '#e08a4a')).toBe('#e08a4a');
  });
});

describe('colorLightness', () => {
  it('从 hsl 三元组读第三个分量', () => {
    expect(colorLightness('hsl(40 42.9% 93.1%)')).toBeCloseTo(0.931, 3);
    expect(colorLightness('hsl(220 30% 12%)')).toBeCloseTo(0.12, 3);
  });

  it('六位和三位 hex 都认', () => {
    expect(colorLightness('#ffffff')).toBeCloseTo(1, 2);
    expect(colorLightness('#000')).toBeCloseTo(0, 2);
  });

  it('认不出的形态返回中等明度，不抛错', () => {
    expect(colorLightness('rgb(1,2,3)')).toBe(0.5);
    expect(colorLightness('')).toBe(0.5);
  });
});

describe('watermarkInk', () => {
  it('深色渐变用白字', () => {
    const ink = watermarkInk('#1a1a2e', '#16213e');
    expect(ink.title).toContain('255, 255, 255');
  });

  it('浅色渐变翻成黑字——内置「中性浅色」原来白字看不见', () => {
    const ink = watermarkInk('#e0e7ff', '#c7d2fe');
    expect(ink.title).toContain('0, 0, 0');
  });

  it('cream 主题那种 90%+ 明度的三元组也翻黑', () => {
    const ink = watermarkInk('hsl(40 42.9% 93.1%)', 'hsl(0 0% 100%)');
    expect(ink.title).toContain('0, 0, 0');
  });
});
