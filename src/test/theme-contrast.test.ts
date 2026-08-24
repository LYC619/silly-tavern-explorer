import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(path.resolve(process.cwd(), 'src/themes.css'), 'utf8');

type Rgb = [number, number, number];

function themeBlock(theme: string): string {
  const match = css.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([\\s\\S]*?)\\}`));
  if (!match) throw new Error(`missing theme block: ${theme}`);
  return match[1];
}

function variable(block: string, name: string): string {
  const match = block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  if (!match) throw new Error(`missing ${name}`);
  return match[1].trim();
}

function resolvedVariable(block: string, name: string, seen = new Set<string>()): string {
  if (seen.has(name)) throw new Error(`cyclic variable reference: ${name}`);
  const value = variable(block, name);
  const reference = value.match(/^var\((--[^)]+)\)$/)?.[1];
  if (!reference) return value;
  return resolvedVariable(block, reference, new Set([...seen, name]));
}

function hex(value: string): Rgb {
  const match = value.match(/^#([0-9a-f]{6})$/i);
  if (!match) throw new Error(`expected hex color, received ${value}`);
  return [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16)) as Rgb;
}

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(color: Rgb): number {
  return 0.2126 * channel(color[0]) + 0.7152 * channel(color[1]) + 0.0722 * channel(color[2]);
}

function contrast(a: Rgb, b: Rgb): number {
  const high = Math.max(luminance(a), luminance(b));
  const low = Math.min(luminance(a), luminance(b));
  return (high + 0.05) / (low + 0.05);
}

function rgba(value: string): { color: Rgb; alpha: number } {
  const match = value.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/);
  if (!match) throw new Error(`expected rgba color, received ${value}`);
  return {
    color: [Number(match[1]), Number(match[2]), Number(match[3])] as Rgb,
    alpha: Number(match[4]),
  };
}

/** 半透明前景压在底色上的实际观感色——语义色的 -bg 都是 rgba 色片。 */
function composite(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as Rgb;
}

/**
 * 语义色四组：每套主题各定义一份，文字色要在三层底色上过 AA，
 * 也要在自己那片 -bg 色片上过 AA（徽章是「浅色底 + 同色文字」的组合，
 * 色片会把底色抬亮，是四种组合里最紧的一档）。
 */
describe('语义色对比度', () => {
  const themes = ['cocoa', 'ink', 'midnight', 'cream'] as const;
  const groups = ['ok', 'warn', 'danger', 'info'] as const;
  const surfaces = ['--bg-canvas', '--bg-chrome', '--bg-elevated'] as const;

  it.each(themes)('%s 定义了四组语义色的文字色与背景色', (theme) => {
    const block = themeBlock(theme);
    for (const group of groups) {
      expect(() => hex(variable(block, `--status-${group}`))).not.toThrow();
      expect(() => rgba(variable(block, `--status-${group}-bg`))).not.toThrow();
    }
  });

  it.each(themes)('%s 的语义色文字在三层底色上达到 AA 4.5:1', (theme) => {
    const block = themeBlock(theme);
    for (const group of groups) {
      const text = hex(variable(block, `--status-${group}`));
      for (const surface of surfaces) {
        const ratio = contrast(text, hex(resolvedVariable(block, surface)));
        expect(ratio, `${theme}/${group} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each(themes)('%s 的语义色文字压在自己的色片上仍达到 AA 4.5:1', (theme) => {
    const block = themeBlock(theme);
    for (const group of groups) {
      const text = hex(variable(block, `--status-${group}`));
      const tint = rgba(variable(block, `--status-${group}-bg`));
      for (const surface of surfaces) {
        const filled = composite(tint.color, tint.alpha, hex(resolvedVariable(block, surface)));
        const ratio = contrast(text, filled);
        expect(ratio, `${theme}/${group} on tinted ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each(themes)('%s 的四组语义色互不相同', (theme) => {
    const block = themeBlock(theme);
    const values = groups.map((group) => variable(block, `--status-${group}`).toLowerCase());
    expect(new Set(values).size).toBe(groups.length);
  });
});

describe('主题活动文字对比度', () => {
  it.each(['cocoa', 'ink', 'midnight', 'cream'])('%s 的角色页辅助文字使用正文级 token', (theme) => {
    const block = themeBlock(theme);
    expect(resolvedVariable(block, '--character-label')).toBe(resolvedVariable(block, '--text-body'));
  });

  it.each(['cocoa', 'ink', 'midnight', 'cream'])('%s 的活动文字在侧栏底色上达到 4.5:1', (theme) => {
    const block = themeBlock(theme);
    const text = hex(variable(block, '--brand-text'));
    const chrome = hex(variable(block, '--bg-chrome'));
    expect(contrast(text, chrome)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['cocoa', 'ink', 'midnight', 'cream'])('%s 的侧栏辅助文字在页面与侧栏底色上均达到 4.5:1', (theme) => {
    const block = themeBlock(theme);
    const text = hex(resolvedVariable(block, '--sidebar-text-faint'));
    const canvas = hex(resolvedVariable(block, '--bg-canvas'));
    const chrome = hex(resolvedVariable(block, '--bg-chrome'));
    expect(contrast(text, canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(text, chrome)).toBeGreaterThanOrEqual(4.5);
  });
});

/** 文字四档对三层底色的对比度。三层底色都要过，卡片底（elevated）通常是最紧的一档。 */
describe('主题文字阶梯对比度', () => {
  const themes = ['cocoa', 'ink', 'midnight', 'cream'] as const;

  function ratios(theme: string, token: string): number[] {
    const block = themeBlock(theme);
    const text = hex(resolvedVariable(block, token));
    return ['--bg-canvas', '--bg-chrome', '--bg-elevated']
      .map((surface) => contrast(text, hex(resolvedVariable(block, surface))));
  }

  it.each(themes)('%s 的正文色达到 7:1', (theme) => {
    for (const ratio of ratios(theme, '--text-body')) expect(ratio).toBeGreaterThanOrEqual(7);
  });

  it.each(themes)('%s 的次要文字达到 AA 4.5:1', (theme) => {
    for (const ratio of ratios(theme, '--text-muted')) expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('midnight 的最弱一档文字也达到 AA 4.5:1', () => {
    for (const ratio of ratios('midnight', '--text-faint')) expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * cocoa / ink / cream 的 --text-faint 目前是 3.2~3.8:1（只过大字号 AA），
   * 是否统一抬到 4.5 属于配色取舍，需要单独拍板。这里先钉住下限，防止继续下滑：
   * midnight 原来是 2.96:1，低于任何一档，已在本轮抬起来。
   */
  it.each(themes)('%s 的最弱一档文字不低于大字号 AA 3:1', (theme) => {
    for (const ratio of ratios(theme, '--text-faint')) expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it.each(themes)('%s 的文字四档保持可分辨的层级', (theme) => {
    const block = themeBlock(theme);
    const canvas = hex(resolvedVariable(block, '--bg-canvas'));
    const [primary, body, muted, faint] = ['--text-primary', '--text-body', '--text-muted', '--text-faint']
      .map((token) => contrast(hex(resolvedVariable(block, token)), canvas));

    expect(primary).toBeGreaterThan(body);
    expect(body).toBeGreaterThan(muted);
    expect(muted).toBeGreaterThan(faint);
  });
});
