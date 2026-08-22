/**
 * 归档轻量索引（阶段 D1）行为测试。
 *
 * 要测的不是「字段少了几个」，而是三件会真出问题的事：
 * 1. 客户端确实少读了卡面 PNG —— 数 readBinary 次数，不看字段
 * 2. 轻量记录不会污染完整读缓存 —— 否则后续 getCharacter 拿到缺 pngBase64 的记录，
 *    一保存就把卡面抹了（同理故事正文）
 * 3. 网页版 IDB 没有字段投影能力，也必须收窄出同样的形状（尤其 floorCount），
 *    否则两个后端行为分叉，列表在网页版全显示「0 楼」
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createMemFs } from '@/lib/vault/fs';
import { createVault } from '@/lib/vault/vault-backend';
import { setActiveVault } from '@/lib/vault/active';
import { closeDB } from '@/lib/idb';
import {
  getAllCharacters,
  getCharacter,
  saveCharacter,
  saveArchiveStory,
  getArchiveStory,
} from '@/lib/archive-db';
import { listCharacterIndex, listStoryIndex } from '@/lib/archive-index';
import type { ArchiveCharacter, ArchiveStory, StoryBranch } from '@/types/archive';
import type { ChatSession } from '@/types/chat';
import type { STCharacterCard } from '@/lib/png-parser';

const card = { spec: 'chara_card_v2', data: { name: '测试' } } as unknown as STCharacterCard;

function session(title: string, floors: number): ChatSession {
  return {
    id: `sess_${title}`,
    title,
    messages: Array.from({ length: floors }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `第 ${i} 楼`,
    })),
    character: { name: '角色' },
    user: { name: '我' },
    createdAt: 1,
  };
}

function makeChar(id: string, name: string, extra: Partial<ArchiveCharacter> = {}): ArchiveCharacter {
  return { id, name, card, tags: [], status: '未开始', createdAt: 1, updatedAt: 1, ...extra };
}

function makeStory(id: string, title: string, floors: number, extra: Partial<ArchiveStory> = {}): ArchiveStory {
  return {
    id,
    title,
    session: session(title, floors),
    markers: [],
    meta: { modelsUsed: [], playTimeMs: null },
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  };
}

/** 包一层数 readBinary 次数——「跳过了 PNG」只能靠 IO 计数证明，看字段是看不出来的 */
function countingMemFs() {
  const fs = createMemFs();
  const counts = { readBinary: 0 };
  return {
    counts,
    fs: {
      ...fs,
      readBinary: async (path: string) => {
        counts.readBinary += 1;
        return fs.readBinary(path);
      },
    },
  };
}

beforeEach(() => {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  closeDB();
  setActiveVault(null);
});

afterEach(() => {
  setActiveVault(null);
});

describe('客户端文件库：轻量列表', () => {
  it('列角色时完全不读卡面 PNG，完整列表才读', async () => {
    const { fs, counts } = countingMemFs();
    setActiveVault(createVault(fs));
    for (const i of [1, 2, 3]) {
      await saveCharacter(makeChar(`c${i}`, `角色${i}`, { pngBase64: `PNG${i}` }));
    }

    counts.readBinary = 0;
    const light = await listCharacterIndex();
    expect(light).toHaveLength(3);
    expect(counts.readBinary).toBe(0);

    counts.readBinary = 0;
    const full = await getAllCharacters();
    expect(full.map((c) => c.pngBase64)).toEqual(expect.arrayContaining(['PNG1', 'PNG2', 'PNG3']));
    expect(counts.readBinary).toBe(3);
  });

  it('轻量角色不带卡面与立绘，但列表要用的元信息都在', async () => {
    setActiveVault(createVault(createMemFs()));
    await saveCharacter(makeChar('c1', '赫敏', {
      pngBase64: 'PNG',
      portraitRows: [{ id: 'r1', title: '默认', items: [] }],
      tags: ['卡面/NSFW'],
      rating: 8,
      assets: [{ assetId: 'wb1', kind: 'worldbook' }] as ArchiveCharacter['assets'],
    }));

    const [entry] = await listCharacterIndex();
    expect(entry.name).toBe('赫敏');
    expect(entry.tags).toEqual(['卡面/NSFW']);
    expect(entry.rating).toBe(8);
    expect(entry.assets).toHaveLength(1);
    expect('pngBase64' in entry).toBe(false);
    expect('portraitRows' in entry).toBe(false);
  });

  it('轻量故事剥掉正文与分支，楼数仍然对得上', async () => {
    setActiveVault(createVault(createMemFs()));
    const branch: StoryBranch = {
      id: 'b1', name: '分支', session: session('分支', 9), markers: [], createdAt: 1, updatedAt: 1,
    };
    await saveCharacter(makeChar('c1', '角色'));
    await saveArchiveStory(makeStory('s1', '主线', 5, {
      characterId: 'c1',
      branches: [branch],
      lastMessageAt: 4242,
    }));

    const [entry] = await listStoryIndex();
    expect(entry.title).toBe('主线');
    expect(entry.characterId).toBe('c1');
    expect(entry.lastMessageAt).toBe(4242);
    // 楼数只数主线，不把分支算进去
    expect(entry.floorCount).toBe(5);
    expect('session' in entry).toBe(false);
    expect('branches' in entry).toBe(false);
  });

  it('先走轻量列表，之后的完整读依然带着卡面和正文', async () => {
    setActiveVault(createVault(createMemFs()));
    await saveCharacter(makeChar('c1', '赫敏', { pngBase64: 'PNG' }));
    await saveArchiveStory(makeStory('s1', '主线', 5));

    // 轻量读先把两条记录拉进缓存；若两池共用，下面的完整读就会拿到缺字段的版本
    await listCharacterIndex();
    await listStoryIndex();

    expect((await getCharacter('c1'))?.pngBase64).toBe('PNG');
    expect((await getArchiveStory('s1'))?.session.messages).toHaveLength(5);
  });

  it('记录改动后轻量列表跟着变（两池一起失效）', async () => {
    setActiveVault(createVault(createMemFs()));
    await saveCharacter(makeChar('c1', '旧名', { pngBase64: 'PNG' }));
    expect((await listCharacterIndex())[0].name).toBe('旧名');

    await saveCharacter(makeChar('c1', '新名', { pngBase64: 'PNG', updatedAt: 2 }));
    expect((await listCharacterIndex())[0].name).toBe('新名');
  });
});

describe('网页版 IDB：没有字段投影也要收窄成同一形状', () => {
  it('故事列表照样给出楼数且不带正文', async () => {
    await saveArchiveStory(makeStory('s1', '主线', 3, { characterId: 'c1' }));

    const [entry] = await listStoryIndex();
    expect(entry.title).toBe('主线');
    expect(entry.floorCount).toBe(3);
    expect('session' in entry).toBe(false);
    expect('branches' in entry).toBe(false);
  });

  it('角色列表不把卡面 base64 带给调用方', async () => {
    await saveCharacter(makeChar('c1', '赫敏', { pngBase64: 'PNG' }));

    const [entry] = await listCharacterIndex();
    expect(entry.name).toBe('赫敏');
    expect('pngBase64' in entry).toBe(false);
    // 完整读不受影响
    expect((await getCharacter('c1'))?.pngBase64).toBe('PNG');
  });
});
