import { describe, it, expect } from 'vitest';
import {
  planCowSave,
  buildDerivedMeta,
  switchAssetRef,
  addAssetRef,
  removeAssetRef,
  type CowAssetLike,
} from '@/lib/asset-cow';
import type { AssetRef } from '@/types/archive';

const shared: CowAssetLike = { id: 'wb_1', title: '霍格沃茨通用设定' };

describe('planCowSave 写时复制决策', () => {
  it('无角色上下文：原地更新', () => {
    expect(planCowSave(shared, undefined, '', [shared])).toEqual({ action: 'update', targetId: 'wb_1' });
  });

  it('首次在角色上下文修改共享资产：派生副本，命名 原资产名_角色卡名', () => {
    const plan = planCowSave(shared, 'char_h', '赫敏', [shared]);
    expect(plan).toEqual({ action: 'copy', copyTitle: '霍格沃茨通用设定_赫敏', derivedFrom: 'wb_1' });
  });

  it('资产本就是该角色的派生副本：继续更新同一副本，不重复新建', () => {
    const copy: CowAssetLike = {
      id: 'wb_2',
      title: '霍格沃茨通用设定_赫敏',
      derived: { derivedFrom: 'wb_1', characterId: 'char_h', createdAt: 1, updatedAt: 1 },
    };
    expect(planCowSave(copy, 'char_h', '赫敏', [shared, copy])).toEqual({ action: 'update', targetId: 'wb_2' });
  });

  it('该角色已有此原资产的副本、却再次从原资产保存：改写既有副本（redirect）', () => {
    const copy: CowAssetLike = {
      id: 'wb_2',
      title: '霍格沃茨通用设定_赫敏',
      derived: { derivedFrom: 'wb_1', characterId: 'char_h', createdAt: 1, updatedAt: 1 },
    };
    const plan = planCowSave(shared, 'char_h', '赫敏', [shared, copy]);
    expect(plan).toEqual({ action: 'redirect', targetId: 'wb_2', targetTitle: '霍格沃茨通用设定_赫敏' });
  });

  it('别的角色的副本不影响本角色的决策（各自派生）', () => {
    const othersCopy: CowAssetLike = {
      id: 'wb_3',
      title: '霍格沃茨通用设定_哈利',
      derived: { derivedFrom: 'wb_1', characterId: 'char_p', createdAt: 1, updatedAt: 1 },
    };
    const plan = planCowSave(shared, 'char_h', '赫敏', [shared, othersCopy]);
    expect(plan.action).toBe('copy');
  });

  it('在角色上下文里编辑「别人的派生副本」：视为共享资产再派生（不动别人的副本）', () => {
    const othersCopy: CowAssetLike = {
      id: 'wb_3',
      title: '霍格沃茨通用设定_哈利',
      derived: { derivedFrom: 'wb_1', characterId: 'char_p', createdAt: 1, updatedAt: 1 },
    };
    const plan = planCowSave(othersCopy, 'char_h', '赫敏', [shared, othersCopy]);
    expect(plan).toEqual({ action: 'copy', copyTitle: '霍格沃茨通用设定_哈利_赫敏', derivedFrom: 'wb_3' });
  });
});

describe('buildDerivedMeta', () => {
  it('记录 derivedFrom / characterId / diverged / 时间', () => {
    const meta = buildDerivedMeta('wb_1', 'char_h');
    expect(meta.derivedFrom).toBe('wb_1');
    expect(meta.characterId).toBe('char_h');
    expect(meta.diverged).toBe(true);
    expect(meta.createdAt).toBe(meta.updatedAt);
  });
});

describe('switchAssetRef 引用切换', () => {
  const refs: AssetRef[] = [
    { kind: 'worldbook', assetId: 'wb_1' },
    { kind: 'preset', assetId: 'p_1' },
  ];

  it('把匹配的引用换成副本 id，其他引用不动', () => {
    const next = switchAssetRef(refs, 'worldbook', 'wb_1', 'wb_2');
    expect(next).toEqual([
      { kind: 'worldbook', assetId: 'wb_2' },
      { kind: 'preset', assetId: 'p_1' },
    ]);
  });

  it('原引用不存在时追加副本引用（第一次通过工具处理）', () => {
    const next = switchAssetRef(refs, 'regex', 'rx_0', 'rx_1');
    expect(next).toHaveLength(3);
    expect(next[2]).toEqual({ kind: 'regex', assetId: 'rx_1' });
  });

  it('已指向副本时幂等（且清掉残留的原引用）', () => {
    const withBoth: AssetRef[] = [
      { kind: 'worldbook', assetId: 'wb_1' },
      { kind: 'worldbook', assetId: 'wb_2' },
    ];
    expect(switchAssetRef(withBoth, 'worldbook', 'wb_1', 'wb_2')).toEqual([{ kind: 'worldbook', assetId: 'wb_2' }]);
  });

  it('refs 为 undefined 时从空开始', () => {
    expect(switchAssetRef(undefined, 'worldbook', 'a', 'b')).toEqual([{ kind: 'worldbook', assetId: 'b' }]);
  });
});

describe('addAssetRef / removeAssetRef', () => {
  it('添加去重；删除只删匹配项', () => {
    const a = addAssetRef(undefined, 'worldbook', 'wb_1');
    expect(a).toEqual([{ kind: 'worldbook', assetId: 'wb_1' }]);
    expect(addAssetRef(a, 'worldbook', 'wb_1')).toBe(a);
    const b = addAssetRef(a, 'preset', 'p_1');
    expect(removeAssetRef(b, 'worldbook', 'wb_1')).toEqual([{ kind: 'preset', assetId: 'p_1' }]);
  });
});
