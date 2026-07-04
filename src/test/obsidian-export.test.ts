import { describe, it, expect } from 'vitest';
import { summaryToObsidian, storyTreeToObsidian } from '@/lib/obsidian-export';
import type { SummaryItem } from '@/types/summary';
import type { StoryTree, StoryNode } from '@/types/story-tree';

const summary: SummaryItem = {
  id: 's1', bookId: 'b1', bookTitle: '我的故事', kind: 'volume', title: '第一卷 开端',
  volumeNumber: 1, floorStart: 0, floorEnd: 20, content: '本卷讲述了……',
  createdAt: new Date('2026-07-04').getTime(), updatedAt: Date.now(),
};

function node(id: string, parentId: string | null, title: string, order = 0, content = '', hint = ''): StoryNode {
  return { id, parentId, title, hint, content, tags: [], pinned: false, archived: false, order };
}

const tree: StoryTree = {
  id: 't1', bookId: 'b1', bookTitle: '我的故事', title: '角色关系树',
  nodes: [
    node('A', null, '角色', 0),
    node('A1', 'A', '爱丽丝', 0, '女主角', '主角'),
    node('B', null, '事件', 1),
  ],
  createdAt: new Date('2026-07-04').getTime(), updatedAt: Date.now(),
};

describe('summaryToObsidian', () => {
  it('含 frontmatter 与正文', () => {
    const md = summaryToObsidian(summary);
    expect(md).toMatch(/^---\n/);
    expect(md).toContain('title: 第一卷 开端');
    expect(md).toContain('book: 我的故事');
    expect(md).toContain('type: 分卷总结');
    expect(md).toContain('volume: 1');
    expect(md).toContain('floors: 0-20');
    expect(md).toContain('created: 2026-07-04');
    expect(md).toContain('# 第一卷 开端');
    expect(md).toContain('本卷讲述了');
  });
});

describe('storyTreeToObsidian', () => {
  it('单文件大纲带标题层级', () => {
    const md = storyTreeToObsidian(tree);
    expect(md).toContain('type: 故事树');
    expect(md).toContain('nodes: 3');
    expect(md).toContain('## 角色');       // depth0 → h2
    expect(md).toContain('### 爱丽丝 — 主角'); // depth1 → h3 + hint
    expect(md).toContain('女主角');
  });

  it('linkNodes 生成双链', () => {
    const md = storyTreeToObsidian(tree, { linkNodes: true });
    expect(md).toContain('[[角色关系树/角色/爱丽丝\\|爱丽丝]]');
  });

  it('归档节点不导出', () => {
    const t: StoryTree = { ...tree, nodes: tree.nodes.map((n) => n.id === 'A1' ? { ...n, archived: true } : n) };
    expect(storyTreeToObsidian(t)).not.toContain('爱丽丝');
  });
});
