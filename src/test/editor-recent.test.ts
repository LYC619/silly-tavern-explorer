import { describe, expect, it } from 'vitest';
import { pickRecentEdits } from '@/lib/editor-recent';

describe('editor-recent', () => {
  it('混排已绑定/未绑定故事、记录、故事树与资产，按 updatedAt 倒序', () => {
    const items = pickRecentEdits({
      stories: [
        { id: 's1', title: '未绑定暂存', updatedAt: 400 },
        { id: 's2', title: '已绑定不入列', characterId: 'c1', updatedAt: 900 },
      ],
      summaries: [
        { id: 'sum1', title: '第一卷', kind: 'volume', bookId: 's2', updatedAt: 800 },
        { id: 'diary1', title: '角色日记', kind: 'diary', bookId: 's2', updatedAt: 700 },
      ],
      trees: [{ id: 'tree1', title: '故事树', bookId: 's2', updatedAt: 600 }],
      cards: [{ id: 'card1', title: '角色卡', updatedAt: 550 }],
      worldbooks: [{ id: 'w1', title: '设定集', updatedAt: 300 }],
      presets: [{ id: 'p1', title: '预设A', updatedAt: 500 }],
      regexes: [{ id: 'r1', title: '规则集', updatedAt: 100 }],
    });
    expect(items.map((i) => i.id)).toEqual(['s2', 'sum1', 'diary1', 'tree1', 'card1', 'p1']);
    expect(items.find((i) => i.id === 's2')?.path).toBe('/story/s2');
    expect(items.find((i) => i.id === 'sum1')?.state).toEqual({
      view: 'volume', initialTarget: { type: 'record', id: 'sum1' },
    });
    expect(items.find((i) => i.id === 'tree1')?.state).toEqual({
      view: 'tree', initialTarget: { type: 'tree', id: 'tree1' },
    });
    expect(items.find((i) => i.id === 'card1')?.path).toBe('/card-viewer?assetId=card1');
  });

  it('limit 截断', () => {
    const items = pickRecentEdits({
      stories: [],
      summaries: [], trees: [], cards: [],
      worldbooks: Array.from({ length: 10 }, (_, i) => ({ id: `w${i}`, title: `书${i}`, updatedAt: i })),
      presets: [], regexes: [],
    }, 4);
    expect(items).toHaveLength(4);
    expect(items[0].id).toBe('w9');
  });
});
