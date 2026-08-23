import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function componentFiles(dir = resolve(process.cwd(), 'src'), out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'test') componentFiles(full, out);
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const relative = (file: string) => file.replace(resolve(process.cwd()), '').replace(/\\/g, '/');

describe('前端机械修复契约', () => {
  it('主题变量使用统一的状态色和已有的表面色 token', () => {
    const themes = read('src/themes.css');
    const source = read('src/components/assets/OtherAssetPreview.tsx')
      + read('src/components/assets/OtherAssetsBrowser.tsx')
      + read('src/components/library/TagManagerDialog.tsx');

    expect(themes).toContain('--status-warn-bg:');
    expect(themes).toContain('--status-danger-bg:');
    expect(source).not.toMatch(/--status-warning(?:-bg)?/);
    expect(source).not.toContain('--bg-surface');
  });

  it('首屏在渲染前读取 ste-theme 并设置主题属性', () => {
    const html = read('index.html');

    expect(html).toContain("localStorage.getItem('ste-theme')");
    expect(html).toContain("setAttribute('data-theme'");
    expect(html).toContain("classList.toggle('dark'");
    expect(html).toContain("'cocoa', 'ink', 'midnight', 'cream'");
  });

  /**
   * 字号阶梯从 11px 起步（审查报告第三部分）。上一轮只批量替换了 10px 和 13px，
   * 9px 的五处留在了 MessageNavBar 与资产库徽章上——比被禁掉的那档还小。
   * 这里不再列举具体字号，直接扫全树：低于 11px 一律不允许。
   */
  it('全项目没有小于 11px 的字号', () => {
    const offenders: string[] = [];
    for (const file of componentFiles()) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/text-\[(\d+)px\]/g)) {
        if (Number(match[1]) < 11) {
          const line = source.slice(0, match.index!).split('\n').length;
          offenders.push(`${relative(file)}:${line} ${match[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * 组件不许写死颜色字面量：浅色分支写死的 hsl 在深色主题首屏（还没加 .dark）
   * 会闪一下，也换不了肤。rgba 不在此列——立绘之上的黑底白字胶囊是有意为之的例外。
   */
  it('组件不写死 hsl()/hex 颜色，一律走 token', () => {
    const offenders: string[] = [];
    for (const file of componentFiles()) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/-\[(?:hsl\((?!var)|#)[^\]]*\]/g)) {
        const line = source.slice(0, match.index!).split('\n').length;
        offenders.push(`${relative(file)}:${line} ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
