import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('编辑区资产选择器滚动边界', () => {
  it('世界书和预设的填充列表拥有独立且稳定的滚动区域', () => {
    const tools = read('src/pages/Tools.tsx');

    expect(tools).toContain('data-editor-story-picker');
    expect(tools).toContain('className="flex min-h-0 min-w-[24rem] flex-1 flex-col overflow-hidden');
    expect(tools).toContain('data-asset-scroll-region');
    expect(tools).toContain('overflow-y-scroll');
    expect(tools).toContain('overscroll-contain');
  });
});
