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
