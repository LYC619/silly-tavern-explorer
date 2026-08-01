import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('前端状态刷新契约', () => {
  it('状态栏不再展示 ST 接入与数据占用（0801 反馈挪设置页），也不永久缓存状态', () => {
    const source = read('src/components/AppLayout.tsx');
    expect(source).not.toContain('let statusCache');
    const footer = source.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? '';
    expect(footer).not.toContain('已接入 ST 目录');
    expect(footer).not.toContain('usage');
  });

  it('侧栏不再按页面自动折叠（0801 反馈：切页保持用户选择）', () => {
    const hook = read('src/hooks/use-sidenav-state.ts');
    const layout = read('src/components/AppLayout.tsx');
    expect(hook).not.toContain('pageDefault');
    expect(layout).toContain('useSidenavState()');
  });

  it('STImportCard 暴露变更通知，首页和编辑区接入刷新；首页仅未接入时显示', () => {
    const card = read('src/components/tools/STImportCard.tsx');
    const home = read('src/pages/Home.tsx');
    const tools = read('src/pages/Tools.tsx');
    expect(card).toContain('onChanged?: () => void');
    expect(home).toContain('onChanged={handleSTChanged}');
    expect(home).toContain("stConnected === false");
    expect(tools).toContain('onChanged={handleSTChanged}');
  });

  it('首页欢迎语只报归档数，不再堆书名+楼层+时间', () => {
    const home = read('src/pages/Home.tsx');
    expect(home).toContain('您已经归档了');
    expect(home).not.toContain('你上次在');
  });
});

describe('四主题覆盖契约', () => {
  it('全屏阅读器使用主题画布而非固定黑白背景', () => {
    for (const path of [
      'src/components/reader/ReaderView.tsx',
      'src/components/reader/NovelView.tsx',
    ]) {
      const source = read(path);
      expect(source).toContain('bg-canvas');
      expect(source).not.toMatch(/bg-\[#f8f5ec\]|dark:bg-\[#1a1a1a\]/);
    }
  });

  it('状态栏不在文字 token 之外叠加整体透明度', () => {
    const source = read('src/components/AppLayout.tsx');
    const footer = source.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? '';
    expect(footer).not.toContain('opacity-70');
  });
});

describe('卡片键盘操作契约', () => {
  it('角色卡和资产卡提供聚焦与键盘激活', () => {
    const library = read('src/pages/Library.tsx');
    const assets = read('src/pages/AssetLibrary.tsx');
    for (const source of [library, assets]) {
      expect(source).toContain('tabIndex={0}');
      expect(source).toContain("e.key === 'Enter' || e.key === ' '");
      expect(source).toContain('focus-visible:ring-2');
      expect(source).toContain('e.target !== e.currentTarget');
    }
  });

  it('首页编辑区入口不伪装成拖放区', () => {
    const home = read('src/pages/Home.tsx');
    expect(home).toContain('进入编辑区');
    expect(home).not.toContain('丢进来，不用先建档');
  });

  it('编辑区使用紧凑 ST 扫描入口', () => {
    const card = read('src/components/tools/STImportCard.tsx');
    const tools = read('src/pages/Tools.tsx');
    expect(card).toContain("variant?: 'full' | 'compact'");
    expect(tools).toContain('variant="compact"');
  });
});
