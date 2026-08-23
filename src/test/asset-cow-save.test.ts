/**
 * 写时复制落库（阶段 F 抽出的 saveAssetWithCow）。
 *
 * 世界书 / 预设 / 正则三页现在共用这一份，所以这里钉住的每条都是三页同时受益、
 * 也同时会被一次改动毁掉的性质：原资产一个字节都不写、同一角色不重复建副本、
 * 派生副本不继承来源字段。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DerivedAssetMeta } from '@/types/archive';

const updateCharacterAssetReference = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/lib/character-asset-ref', () => ({ updateCharacterAssetReference }));

import { saveAssetWithCow } from '@/lib/asset-cow-save';

/** 形状取三类资产的公共部分：载荷 + 可选来源字段 + 可选 autoSaved */
interface FakeAsset {
  id: string;
  title: string;
  rules: string[];
  derived?: DerivedAssetMeta;
  sourcePath?: string;
  sourceModifiedAt?: number;
  autoSaved?: boolean;
  createdAt: number;
  updatedAt: number;
}

function mkAsset(over: Partial<FakeAsset> & { id: string; title: string }): FakeAsset {
  return { rules: ['旧'], createdAt: 100, updatedAt: 200, ...over };
}

const NOW = 9_000;
let saved: FakeAsset[];
const save = async (item: FakeAsset) => { saved.push(item); };

function run(base: FakeAsset, all: FakeAsset[], title = '编辑器里的名字') {
  return saveAssetWithCow<FakeAsset>({
    kind: 'worldbook',
    base,
    all,
    characterId: 'char_h',
    characterName: '赫敏',
    title,
    content: { rules: ['新'], autoSaved: false },
    newId: () => 'new_id',
    save,
    now: NOW,
  });
}

beforeEach(() => {
  saved = [];
  updateCharacterAssetReference.mockClear().mockResolvedValue(undefined);
});

describe('saveAssetWithCow', () => {
  it('首次改共享资产：原资产不被写，另存派生副本并把角色引用切过去', async () => {
    const shared = mkAsset({ id: 'a_shared', title: '共享' });

    const result = await run(shared, [shared]);

    expect(result).toEqual({ action: 'copy', targetId: 'new_id', title: '共享_赫敏' });
    expect(saved.map((s) => s.id)).toEqual(['new_id']);
    expect(saved[0]).toMatchObject({
      title: '共享_赫敏',
      rules: ['新'],
      autoSaved: false,
      createdAt: NOW,
      updatedAt: NOW,
      derived: { derivedFrom: 'a_shared', characterId: 'char_h', diverged: true },
    });
    expect(updateCharacterAssetReference).toHaveBeenCalledWith(
      'char_h', 'worldbook', 'a_shared', 'new_id', NOW,
    );
  });

  it('派生副本不继承原资产的来源字段', async () => {
    // 副本不是从那个 ST 文件导入来的；带着 sourcePath 会让「重复导入判定」把副本认成源文件
    const imported = mkAsset({
      id: 'a_src', title: '从 ST 导入的', sourcePath: 'D:/ST/worlds/x.json', sourceModifiedAt: 42,
    });

    await run(imported, [imported]);

    expect(saved[0].sourcePath).toBeUndefined();
    expect(saved[0].sourceModifiedAt).toBeUndefined();
  });

  it('同一角色再次保存：更新既有副本，不重复新建，标题沿用副本自己的', async () => {
    const shared = mkAsset({ id: 'a_shared', title: '共享' });
    const copy = mkAsset({
      id: 'a_copy',
      title: '共享_赫敏',
      derived: { derivedFrom: 'a_shared', characterId: 'char_h', diverged: true, createdAt: 1, updatedAt: 1 },
    });

    const result = await run(shared, [shared, copy], '编辑器里被改过的名字');

    expect(result).toEqual({ action: 'redirect', targetId: 'a_copy', title: '共享_赫敏' });
    expect(saved.map((s) => s.id)).toEqual(['a_copy']);
    expect(saved[0].title).toBe('共享_赫敏');
    expect(saved[0].derived).toMatchObject({ createdAt: 1, updatedAt: NOW });
    expect(updateCharacterAssetReference).toHaveBeenCalledWith(
      'char_h', 'worldbook', 'a_shared', 'a_copy', NOW,
    );
  });

  it('本就是该角色的副本：原地更新，标题跟编辑器走', async () => {
    const copy = mkAsset({
      id: 'a_copy',
      title: '共享_赫敏',
      sourcePath: 'D:/keep/me.json',
      derived: { derivedFrom: 'a_shared', characterId: 'char_h', diverged: true, createdAt: 1, updatedAt: 1 },
    });

    const result = await run(copy, [copy], '改过的名字');

    expect(result).toEqual({ action: 'update', targetId: 'a_copy', title: '改过的名字' });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ id: 'a_copy', title: '改过的名字', updatedAt: NOW });
    // 原地更新是同一条记录，来源字段照旧保留（对照上面的副本分支）
    expect(saved[0].sourcePath).toBe('D:/keep/me.json');
    expect(saved[0].derived).toMatchObject({ updatedAt: NOW });
  });

  it('别的角色的副本不算数，照样为当前角色新建', async () => {
    const shared = mkAsset({ id: 'a_shared', title: '共享' });
    const othersCopy = mkAsset({
      id: 'a_other', title: '共享_罗恩',
      derived: { derivedFrom: 'a_shared', characterId: 'char_r', diverged: true, createdAt: 1, updatedAt: 1 },
    });

    const result = await run(shared, [shared, othersCopy]);

    expect(result.action).toBe('copy');
    expect(saved.map((s) => s.id)).toEqual(['new_id']);
  });
});
