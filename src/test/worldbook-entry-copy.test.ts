/** 世界书条目跨书复制/转移（阶段9.8 余项）：uid 顺延重编号、深拷贝解耦 */
import { describe, expect, it } from 'vitest';
import { appendEntries } from '@/lib/worldbook-entry-copy';
import { normalizeEntry, type WorldBook } from '@/types/worldbook';

const book = (uids: number[]): WorldBook => ({
  entries: Object.fromEntries(uids.map((u) => [String(u), normalizeEntry({ uid: u, key: [`k${u}`], content: `c${u}` }, u)])),
  originalData: { name: '目标' },
});

describe('appendEntries', () => {
  it('uid 从目标最大值顺延，不与目标撞号', () => {
    const target = book([0, 5]);
    const src = book([0, 1]);
    const out = appendEntries(target, Object.values(src.entries));
    expect(Object.keys(out.entries).sort()).toEqual(['0', '5', '6', '7'].sort());
    expect(out.entries['6'].uid).toBe(6);
    expect(out.entries['6'].content).toBe('c0');
    expect(out.entries['7'].content).toBe('c1');
    // 目标原条目与 originalData 不动
    expect(out.entries['5'].content).toBe('c5');
    expect(out.originalData).toEqual({ name: '目标' });
  });

  it('深拷贝：改追加后的条目不影响来源', () => {
    const target = book([]);
    const srcEntry = normalizeEntry({ uid: 9, key: ['原'], content: '原文' }, 9);
    const out = appendEntries(target, [srcEntry]);
    out.entries['0'].content = '改过';
    out.entries['0'].key.push('新增');
    expect(srcEntry.content).toBe('原文');
    expect(srcEntry.key).toEqual(['原']);
  });

  it('空目标从 0 开始编号；不修改传入的 target 对象', () => {
    const target = book([]);
    const out = appendEntries(target, Object.values(book([3]).entries));
    expect(Object.keys(out.entries)).toEqual(['0']);
    expect(Object.keys(target.entries)).toEqual([]);
  });
});
