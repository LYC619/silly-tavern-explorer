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

/** 调用方只给 id，库内内容一律现读——所以「传进去的快照」在这个 API 上根本不存在 */
function run(baseId: string, inVault: FakeAsset[], title = '编辑器里的名字') {
  return saveAssetWithCow<FakeAsset>({
    kind: 'worldbook',
    baseId,
    reload: async () => inVault,
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
  updateCharacterAssetReference.mockClear().mockResolvedValue({ id: 'char_h' });
});

describe('saveAssetWithCow', () => {
  it('首次改共享资产：原资产不被写，另存派生副本并把角色引用切过去', async () => {
    const shared = mkAsset({ id: 'a_shared', title: '共享' });

    const result = await run('a_shared', [shared]);

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

    await run('a_src', [imported]);

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

    const result = await run('a_shared', [shared, copy], '编辑器里被改过的名字');

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

    const result = await run('a_copy', [copy], '改过的名字');

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

    const result = await run('a_shared', [shared, othersCopy]);

    expect(result.action).toBe('copy');
    expect(saved.map((s) => s.id)).toEqual(['new_id']);
  });
});

describe('saveAssetWithCow 落库前重读库内数据', () => {
  it('用重读到的记录展开，不是页面挂载时的那份', async () => {
    // 挂载后别处给这条资产补了来源路径。用陈旧快照展开会把它抹掉
    const fresh = mkAsset({ id: 'a_copy', title: '库里的名字', sourcePath: 'D:/别处刚写的.json' });
    fresh.derived = { derivedFrom: 'a_shared', characterId: 'char_h', diverged: true, createdAt: 1, updatedAt: 1 };

    await run('a_copy', [fresh], '编辑器里的名字');

    expect(saved[0].sourcePath).toBe('D:/别处刚写的.json');
  });

  it('挂载后别处才建的派生副本也能认出来，不重复新建', async () => {
    const shared = mkAsset({ id: 'a_shared', title: '共享' });
    const copyMadeLater = mkAsset({
      id: 'a_late', title: '共享_赫敏',
      derived: { derivedFrom: 'a_shared', characterId: 'char_h', diverged: true, createdAt: 1, updatedAt: 1 },
    });

    // 重读才看得见 a_late；只认快照的话这里会走 copy 分支，白建一份
    const result = await run('a_shared', [shared, copyMadeLater]);

    expect(result.action).toBe('redirect');
    expect(saved.map((s) => s.id)).toEqual(['a_late']);
  });

  it('重读失败：中止，不落库也不切引用', async () => {
    const boom = saveAssetWithCow<FakeAsset>({
      kind: 'worldbook',
      baseId: 'a_shared',
      reload: async () => { throw new Error('库读不出来'); },
      characterId: 'char_h',
      characterName: '赫敏',
      title: '名字',
      content: { rules: ['新'] },
      newId: () => 'new_id',
      save,
      now: NOW,
    });

    await expect(boom).rejects.toThrow('库读不出来');
    expect(saved).toEqual([]);
    expect(updateCharacterAssetReference).not.toHaveBeenCalled();
  });

  it('这条资产已经不在库里：中止，不落库也不切引用', async () => {
    // 绝不能拿陈旧快照顶替——那等于把用户已经删掉的资产又写回去
    const somethingElse = mkAsset({ id: 'a_other', title: '别的' });

    await expect(run('a_deleted', [somethingElse])).rejects.toThrow('已经不在库里');
    expect(saved).toEqual([]);
    expect(updateCharacterAssetReference).not.toHaveBeenCalled();
  });

  it('资产已写入但角色引用切换失败时抛出明确错误', async () => {
    updateCharacterAssetReference.mockRejectedValueOnce(new Error('角色写入失败'));

    await expect(run('a_shared', [mkAsset({ id: 'a_shared', title: '共享' })]))
      .rejects.toThrow('角色引用切换失败');
    expect(saved).toHaveLength(1);
  });

  it('角色已不存在时不把未切换引用报告为成功', async () => {
    updateCharacterAssetReference.mockResolvedValueOnce(undefined);

    await expect(run('a_shared', [mkAsset({ id: 'a_shared', title: '共享' })]))
      .rejects.toThrow('角色引用切换失败');
  });
});
