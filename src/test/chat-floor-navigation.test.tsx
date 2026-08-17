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
  });
});
