import { describe, expect, it } from 'vitest';
import { classifyAssetSource } from '@/lib/asset-source';

describe('资产来源互斥分类', () => {
  it('按 派生 > 自动保留 > ST > 工具入库 的优先级只返回一类', () => {
    expect(classifyAssetSource({ derived: true, autoSaved: true, fromST: true })).toBe('derived');
    expect(classifyAssetSource({ autoSaved: true, fromST: true })).toBe('autoSaved');
    expect(classifyAssetSource({ fromST: true })).toBe('fromST');
    expect(classifyAssetSource({})).toBe('manual');
  });
});
