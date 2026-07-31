import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('前端状态刷新契约', () => {
  it('AppLayout 不永久缓存状态，且客户端不展示 WebView 用量', () => {
    const source = read('src/components/AppLayout.tsx');
    expect(source).not.toContain('let statusCache');
    expect(source).toContain('statusRefreshKey');
    expect(source).toMatch(/client\s*\?\s*Promise\.resolve\(null\)/);
  });

  it('STImportCard 暴露变更通知，首页和编辑区接入刷新', () => {
    const card = read('src/components/tools/STImportCard.tsx');
    const home = read('src/pages/Home.tsx');
    const tools = read('src/pages/Tools.tsx');
    expect(card).toContain('onChanged?: () => void');
    expect(home).toContain('onChanged={handleSTChanged}');
    expect(tools).toContain('onChanged={handleSTChanged}');
  });

  it('首页使用归档阅读位置，不把消息总数当作离开楼层', () => {
    const home = read('src/pages/Home.tsx');
    expect(home).toContain('getLastViewedLine');
    expect(home).not.toContain('lastViewed.session.messages.length} 楼');
  });
});
