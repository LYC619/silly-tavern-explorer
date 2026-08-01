import { describe, expect, it } from 'vitest';
import { pickRecentEdits } from '@/lib/editor-recent';

describe('editor-recent', () => {
  it('只取未绑定故事，四类混排按 updatedAt 倒序', () => {
    const items = pickRecentEdits({
      stories: [
        { id: 's1', title: '未绑定暂存', updatedAt: 400 },
        { id: 's2', title: '已绑定不入列', characterId: 'c1', updatedAt: 900 },
      ],
      worldbooks: [{ id: 'w1', title: '设定集', updatedAt: 300 }],
      presets: [{ id: 'p1', title: '预设A', updatedAt: 500 }],
      regexes: [{ id: 'r1', title: '规则集', updatedAt: 100 }],
    });
    expect(items.map((i) => i.id)).toEqual(['p1', 's1', 'w1', 'r1']);
    expect(items[0].path).toBe('/preset?assetId=p1');
    expect(items[1].path).toBe('/story/s1');
  });

  it('limit 截断', () => {
    const items = pickRecentEdits({
      stories: [],
      worldbooks: Array.from({ length: 10 }, (_, i) => ({ id: `w${i}`, title: `书${i}`, updatedAt: i })),
      presets: [], regexes: [],
    }, 4);
    expect(items).toHaveLength(4);
    expect(items[0].id).toBe('w9');
  });
});
