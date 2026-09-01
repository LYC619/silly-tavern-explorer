/**
 * 阅读通道（首页/角色库 → 角色页 → 故事 tab → 就地阅读 → 小说视图）上的窄屏约定。
 *
 * 这几条守的是源码形状而不是渲染结果，理由同 frontend-contract.test.ts：
 * 要验的是「窄屏分支还在」，而这些分支散在四个组件的 className 里，
 * 渲染整条通道要拖进 archive-db、ResizeObserver、虚拟列表一大串环境。
 * 撞红时先想清楚意图有没有变，改断言，别改代码迁就它。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('就地阅读顶栏', () => {
  const src = read('src/components/character/InlineStoryReader.tsx');

  /**
   * 这条最要紧：顶栏的实测高度会喂给 ChatWorkbench 的 readerStickyTop，
   * 它换一行，正文就永久少一行——而顶栏原来是 flex-wrap，390px 下必然换行。
   */
  it('窄屏不换行', () => {
    expect(src).toMatch(/isCompact \? 'flex-nowrap' : 'flex-wrap'/);
  });

  it('返回和「在编辑器中打开」窄屏收成纯图标，但留 aria-label', () => {
    expect(src).toContain("aria-label=\"返回故事列表\"");
    expect(src).toContain("aria-label=\"在编辑器中打开\"");
    // 文案本身由 isCompact 决定是否渲染
    expect(src).toMatch(/\{!isCompact && '故事列表'\}/);
    expect(src).toMatch(/\{!isCompact && '在编辑器中打开'\}/);
  });

  it('标题在窄屏吃掉剩余宽度（min-w-0 才能真截断）', () => {
    expect(src).toMatch(/isCompact \? 'min-w-0 flex-1 justify-start px-1\.5' : 'max-w-72'/);
  });
});

describe('工作台工具条', () => {
  const src = read('src/components/chat/ChatWorkbench.tsx');

  /**
   * 三个调用方传的 toolbarExtras 第一项都是「小说视图」——这条通道的终点。
   * 排在外观+搜索后面它会被挤出屏幕，得横滑才找得到。
   */
  it('窄屏把父页追加项提到最前，桌面档仍留在右组末尾', () => {
    expect(src).toContain('{isCompact && toolbarExtras}');
    expect(src).toContain('{!isCompact && toolbarExtras}');
  });

  it('窄屏单行横向滚动，不换行', () => {
    expect(src).toMatch(/isCompact\s*\n?\s*\? 'flex-nowrap overflow-x-auto/);
  });
});

describe('搜索框宽度', () => {
  it('窄屏收窄——整条搜索栏原本占掉 390px 的三分之二', () => {
    expect(read('src/components/chat/MessageSearchBar.tsx'))
      .toMatch(/isCompact \? 'w-24' : 'w-40'/);
  });
});

describe('悬停才显形的次要操作', () => {
  /**
   * 触屏没有 hover，`opacity-0 group-hover:opacity-100` 的按钮在手机上
   * 永远全透明，却照样占位、可点、能被读屏念到——「看不见的删除键」。
   * 统一换成 .hover-reveal（用 @media (hover: hover) 判定，见 index.css）。
   */
  it('index.css 里的 hover-reveal 只在有真悬停的设备上藏起来', () => {
    const css = read('src/index.css');
    expect(css).toContain('.hover-reveal');
    expect(css).toMatch(/@media \(hover: hover\)\s*\{\s*\.hover-reveal\s*\{\s*opacity: 0;/);
    // 键盘走到它、或它自己弹开了菜单，都得显形
    expect(css).toContain('.hover-reveal:focus-visible');
    expect(css).toContain(".hover-reveal[data-state='open']");
  });

  it('源码里不再有裸的 opacity-0 group-hover:opacity-100', () => {
    const files = [
      'src/components/character/StoryListSection.tsx',
      'src/components/character/NotesSection.tsx',
      'src/pages/Library.tsx',
      'src/components/story-tree/StoryTreeView.tsx',
    ];
    const offenders = files.filter((f) => read(f).includes('opacity-0 group-hover:opacity-100'));
    expect(offenders).toEqual([]);
  });
});
