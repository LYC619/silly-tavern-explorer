import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('聊天楼层工具本地定位', () => {
  it('由正文预览容器持有，不再按全局侧栏宽度计算视口偏移', () => {
    const nav = read('src/components/chat/MessageNavBar.tsx');
    const workbench = read('src/components/chat/ChatWorkbench.tsx');
    const workspace = read('src/pages/StoryWorkspace.tsx');

    expect(workbench).toContain('data-chat-preview-shell');
    expect(workbench).toContain('<MessageNavBar');
    expect(workbench).not.toContain('navBarLeftClass');
    expect(workbench).not.toContain("position={readerMode ? 'sticky' : 'fixed'}");
    expect(workspace).not.toContain('navBarLeftClass=');
    expect(nav).not.toContain('leftClass');
    expect(nav).not.toContain("position = 'fixed'");
    expect(nav).not.toContain('left-24');
    expect(nav).toContain("className=\"sticky self-start");
    // 非阅读模式工具栏同样 sticky，落点与判定线必须避开其实高，否则跳转目标被盖住半行
    expect(workbench).toContain('scrollPaddingStart={(readerMode ? readerStickyTop : 0) + toolbarHeight + 8}');
  });

  it('普通楼层和收藏跳转在虚拟定位后按真实行顶二次校正', () => {
    const preview = read('src/components/chat/ChatPreview.tsx');
    expect(preview).toContain('scrollToVirtualRow');
    expect(preview).toContain('target.getBoundingClientRect()');
    expect(preview).toContain('calculateSearchRevealScrollTop');
    expect(preview).toContain('scrollToFloor: (floor: number) => {');
    expect(preview).toContain('scrollToVirtualRow(idx)');
    expect(preview).not.toContain("if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'start' });");
  });
});
