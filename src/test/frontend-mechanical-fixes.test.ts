import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

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
});
