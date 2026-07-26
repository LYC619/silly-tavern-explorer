/**
 * 角色卡内嵌资产自动识别（阶段9.5）：character_book / extensions.regex_scripts
 * 入库为独立资产 + 返回 AssetRef。库侧走 createVault(memFs) 真落盘断言。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createMemFs } from '@/lib/vault/fs';
import { createVault } from '@/lib/vault/vault-backend';
import { setActiveVault } from '@/lib/vault/active';
import type { STCharacterCard } from '@/lib/png-parser';
import { buildCharacterFromCard } from '@/lib/archive-db';
import { importEmbeddedAssets } from '@/lib/card-embedded-assets';
import { getAllWorldBooks } from '@/lib/worldbook-db';
import { getAllRegexCollections } from '@/lib/regex-db';

afterEach(() => setActiveVault(null));

const fullCard = {
  spec: 'chara_card_v2',
  data: {
    name: '赫敏',
    character_book: {
      name: '魔法笔记',
      entries: [{ keys: ['魔杖'], content: '设定正文', insertion_order: 1, enabled: true }],
    },
    extensions: {
      regex_scripts: [{ scriptName: '去横线', findRegex: '/---/g', replaceString: '', placement: [2], disabled: false }],
    },
  },
} as unknown as STCharacterCard;

describe('importEmbeddedAssets', () => {
  it('内嵌世界书+正则：各建一份资产、返回两条引用、标题取卡内名或角色名', async () => {
    setActiveVault(createVault(createMemFs()));
    const character = buildCharacterFromCard(fullCard);
    const refs = await importEmbeddedAssets(character);
    expect(refs.map((r) => r.kind).sort()).toEqual(['regex', 'worldbook']);

    const wbs = await getAllWorldBooks();
    expect(wbs).toHaveLength(1);
    expect(wbs[0].title).toBe('魔法笔记');
    expect(wbs[0].id).toBe(refs.find((r) => r.kind === 'worldbook')!.assetId);
    expect(Object.values(wbs[0].worldbook.entries)[0].content).toBe('设定正文');

    const regs = await getAllRegexCollections();
    expect(regs).toHaveLength(1);
    expect(regs[0].title).toBe('赫敏·内置正则');
    expect(regs[0].rules).toHaveLength(1);
    expect(regs[0].rules[0].name).toBe('去横线');
  });

  it('卡内世界书没有 name 时用「角色名·内置世界书」', async () => {
    setActiveVault(createVault(createMemFs()));
    const card = {
      spec: 'chara_card_v2',
      data: {
        name: '哈利',
        character_book: { entries: [{ keys: ['扫帚'], content: '内容', enabled: true }] },
      },
    } as unknown as STCharacterCard;
    const refs = await importEmbeddedAssets(buildCharacterFromCard(card));
    expect(refs).toHaveLength(1);
    expect((await getAllWorldBooks())[0].title).toBe('哈利·内置世界书');
  });

  it('无内嵌资产/空 entries：不建资产返回空数组', async () => {
    setActiveVault(createVault(createMemFs()));
    const plain = { spec: 'chara_card_v2', data: { name: '素卡' } } as unknown as STCharacterCard;
    expect(await importEmbeddedAssets(buildCharacterFromCard(plain))).toEqual([]);
    const emptyBook = {
      spec: 'chara_card_v2',
      data: { name: '空书卡', character_book: { entries: [] }, extensions: { regex_scripts: [] } },
    } as unknown as STCharacterCard;
    expect(await importEmbeddedAssets(buildCharacterFromCard(emptyBook))).toEqual([]);
    expect(await getAllWorldBooks()).toEqual([]);
    expect(await getAllRegexCollections()).toEqual([]);
  });
});
