/**
 * 点击热区兜底（.tap-target）。
 *
 * 项目里图标按钮普遍是 24px、复选框只有 16px，触屏点不中。修法是给这些元素挂
 * 一个透明的居中伪元素把命中范围撑到 32×32，视觉尺寸不变。
 *
 * 这里守两件事：
 * 1. Button / Checkbox 渲染出来后 tap-target 还在——tailwind-merge 合并调用方的
 *    className 时不能把它吃掉（普通类名不参与冲突消解，但基类顺序改动可能漏掉）。
 * 2. 裸 <button>（不走 ui/button）里凡是自己写死了小于 32px 的高度，必须显式带
 *    tap-target 或用 h-8 以上的外框，否则新代码会重新长出点不中的按钮。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) tsxFiles(full, out);
    else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) out.push(full);
  }
  return out;
}

/** 从 `<button` 开始扫到开标签结束的 `>`，只取这个按钮自己的属性（不含子元素） */
function openingTag(source: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') { depth += 1; continue; }
    if (ch === '}') { depth -= 1; continue; }
    if (ch === '>' && depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start, start + 900);
}

describe('点击热区', () => {
  it('index.css 定义的 .tap-target 把命中范围撑到 32px', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    const rule = css.match(/\.tap-target::after\s*\{([\s\S]*?)\}/)?.[1] ?? '';

    expect(rule).toMatch(/min-width:\s*32px/);
    expect(rule).toMatch(/min-height:\s*32px/);
    expect(rule).toMatch(/position:\s*absolute/);
    // 100% 保证够大的元素不被缩小，min-* 只对小元素生效
    expect(rule).toMatch(/width:\s*100%/);
    expect(rule).toMatch(/height:\s*100%/);
  });

  it('小尺寸 Button 合并调用方 className 之后仍保留 tap-target', async () => {
    await act(async () => {
      root.render(<Button size="icon" className="h-6 w-6">x</Button>);
    });

    const button = container.querySelector('button')!;
    expect(button.className.split(/\s+/)).toContain('tap-target');
    // 调用方指定的视觉尺寸不受影响
    expect(button.className).toContain('h-6');
    expect(button.className).toContain('w-6');
  });

  it('Checkbox（16px）默认带 tap-target', async () => {
    await act(async () => {
      root.render(<Checkbox />);
    });

    const box = container.querySelector('button')!;
    expect(box.className.split(/\s+/)).toContain('tap-target');
    expect(box.className).toContain('h-4');
  });

  it('裸 <button> 不允许再出现没有热区兜底的小高度', () => {
    const offenders: string[] = [];
    let guarded = 0;
    for (const file of tsxFiles(resolve(process.cwd(), 'src'))) {
      const source = readFileSync(file, 'utf8');
      const matches = source.matchAll(/<button\b/g);
      for (const match of matches) {
        const tag = openingTag(source, match.index!);
        // 只看自己声明了固定高度的：h-0~h-7 都不足 32px。
        // 排除 min-h-* / max-h-* 与 h-full / h-[…]，那些不是固定小高度。
        if (!/(?<![\w-])h-[0-7](?![\w.])/.test(tag)) continue;
        if (tag.includes('tap-target')) { guarded += 1; continue; }
        const line = source.slice(0, match.index!).split('\n').length;
        offenders.push(`${file.replace(resolve(process.cwd()), '').replace(/\\/g, '/')}:${line}`);
      }
    }

    expect(offenders).toEqual([]);
    // 扫描本身没瞎：现存的小尺寸裸按钮确实被认出来并且带着兜底
    expect(guarded).toBeGreaterThanOrEqual(3);
  });
});
