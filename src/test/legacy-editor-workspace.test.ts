import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => {
  const absolute = resolve(process.cwd(), path);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : '';
};

describe('旧版编辑工作台恢复契约', () => {
  it('总结工作台恢复页面级生成/展示结构，不再套 OrganizePanel', () => {
    const workspace = read('src/pages/StoryWorkspace.tsx');
    const summary = read('src/components/organize/SummaryWorkspace.tsx');

    expect(workspace).toContain('<SummaryWorkspace');
    expect(summary).toContain('生成工作台');
    expect(summary).toContain('展示页');
    expect(summary).toContain('<SavedSummaryList');
    expect(summary).toContain('<SummaryGallery');
    expect(summary).toContain('<RecordWorkbench');
  });

  it('故事树恢复旧版顶部选树工具行和双栏编辑器', () => {
    const workspace = read('src/pages/StoryWorkspace.tsx');
    const tree = read('src/components/organize/StoryTreeWorkspace.tsx');

    expect(workspace).toContain('<StoryTreeWorkspace');
    expect(tree).toContain('data-story-tree-selector');
    expect(tree).toContain('<TreeWorkbench');
    expect(tree).toContain('新建');
    expect(tree).toContain('导入');
    expect(tree).toContain('导出');
  });

  it('全局侧栏保留父子导航，编辑区窄工具栏固定挂在其右侧', () => {
    const layout = read('src/components/AppLayout.tsx');
    const rail = read('src/components/EditorRail.tsx');

    expect(layout).toContain('area.children.map((child)');
    expect(layout).toContain('<EditorRail />');
    expect(layout).not.toContain('data-editor-flat-nav');
    expect(rail).toContain('data-editor-rail');
    expect(rail).toContain('editorStoryPathForNavKey');
    expect(rail).toContain("fallbackPath: '/chat'");
    expect(rail).not.toContain("fallbackPath: '/tools?focus=chat'");
  });
});
