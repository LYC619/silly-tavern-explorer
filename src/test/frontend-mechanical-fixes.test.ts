import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function componentFiles(
  dir = resolve(process.cwd(), 'src'),
  out: string[] = [],
  extensions: string[] = ['.tsx'],
): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'test') componentFiles(full, out, extensions);
    else if (extensions.some((ext) => entry.name.endsWith(ext))) out.push(full);
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

  /**
   * 状态含义一律走四组语义色 token（--status-ok/warn/danger/info），不再手写
   * Tailwind 调色板。手写的那套有两个毛病：一是四套主题各有各的底色，一个
   * emerald-600 不可能同时在米色底和墨黑底上都够对比；二是同一个「新增」在
   * 不同文件里长成 emerald-500/emerald-600/green-700 三种绿。
   *
   * 下面这些文件用同一批色名表达的是**分类**而不是状态——分类色和 --tag-* 同族，
   * 数量随枚举走（世界书三种激活策略、故事树四种节点、消息的发言人两侧），
   * 压成四组语义色反而会丢掉可分辨性。改动这些文件时请连着这条理由一起改。
   */
  const CATEGORICAL_COLOR_FILES: Record<string, string> = {
    '/src/types/story-tree.ts': '故事树四类节点（人物/地点/物品/事件）的分类色',
    '/src/components/worldbook/EntryCard.tsx': '世界书三种激活策略（常驻/向量/关键词）的分类色点',
    '/src/components/worldbook/EntryFilterBar.tsx': '同上，筛选条上的对应色',
    '/src/components/preset/PresetRoleBadge.tsx': '预设块的 role 分类（user/assistant/system）',
    '/src/components/reader/ReaderView.tsx': '发言人两侧配色（用户/角色），由 reader-view-theme 测试钉住',
    '/src/components/story-tree/StoryTimeline.tsx': '时间轴的装饰性主色',
    '/src/components/character/StoryListSection.tsx': '评分星标的琥珀色（状态 chip 已走 token）',
    '/src/components/character/RatingPanel.tsx': '评分星标的琥珀色',
    '/src/components/workspace/OutlinePanel.tsx': '书签标记的琥珀色',
  };

  it('状态含义不写死 Tailwind 调色板，一律走语义色 token', () => {
    const statusPalette = /\b(?:text|bg|border|border-l|fill|ring|ring-offset)-(?:green|red|yellow|emerald|amber|rose|lime)-\d+/;
    const offenders: string[] = [];
    for (const file of componentFiles(resolve(process.cwd(), 'src'), [], ['.tsx', '.ts'])) {
      const path = relative(file);
      if (path in CATEGORICAL_COLOR_FILES) continue;
      const source = readFileSync(file, 'utf8');
      source.split('\n').forEach((text, index) => {
        const match = text.match(statusPalette);
        if (match) offenders.push(`${path}:${index + 1} ${match[0]}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('分类色白名单不留过期条目', () => {
    const stale = Object.keys(CATEGORICAL_COLOR_FILES).filter((path) => {
      const source = readFileSync(resolve(process.cwd(), `.${path}`), 'utf8');
      return !/\b(?:text|bg|border|border-l|fill|ring|ring-offset)-(?:green|red|yellow|emerald|amber|rose|lime|sky|blue|purple|violet)-\d+/.test(source);
    });
    expect(stale).toEqual([]);
  });

  it('四套主题各自定义了完整的四组语义色', () => {
    const themes = read('src/themes.css');
    for (const theme of ['cocoa', 'ink', 'midnight', 'cream']) {
      const block = themes.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1];
      expect(block, `missing theme block: ${theme}`).toBeTruthy();
      for (const group of ['ok', 'warn', 'danger', 'info']) {
        expect(block, `${theme} 缺 --status-${group}`).toContain(`--status-${group}:`);
        expect(block, `${theme} 缺 --status-${group}-bg`).toContain(`--status-${group}-bg:`);
      }
    }
  });

  it('全项目没有第五组语义色', () => {
    const offenders: string[] = [];
    const allowed = new Set(['ok', 'warn', 'danger', 'info']);
    for (const source of [read('src/themes.css'), read('src/index.css')]) {
      for (const match of source.matchAll(/--status-([a-z]+)(?:-bg)?\b/g)) {
        if (!allowed.has(match[1])) offenders.push(match[0]);
      }
    }
    for (const file of componentFiles(resolve(process.cwd(), 'src'), [], ['.tsx', '.ts'])) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/--status-([a-z]+)(?:-bg)?\b/g)) {
        if (!allowed.has(match[1])) offenders.push(`${relative(file)} ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
