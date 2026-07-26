/**
 * 文件库后端（vault-backend）store→文件映射策略测试（2.0 阶段7.2b）。
 * 对内存 FS 跑；覆盖任务规格八项 + 重开库全量扫描。
 */
import { describe, expect, it } from 'vitest';
import { createMemFs } from '@/lib/vault/fs';
import { createVault } from '@/lib/vault/vault-backend';
import { parseJsonl } from '@/lib/adapters/st/chat-jsonl';
import { parsePreset } from '@/lib/preset-parser';
import type { ArchiveCharacter, ArchiveStory, StoryBranch } from '@/types/archive';
import type { SummaryItem, SummaryKind } from '@/types/summary';
import type { WorldBookItem, WorldBookEntry } from '@/types/worldbook';
import type { PresetItem } from '@/types/preset';
import type { CardItem } from '@/types/character-card';
import type { RegexCollectionItem } from '@/lib/regex-db';
import type { ChatSession, ChatMessage, STRawMessage } from '@/types/chat';
import type { STCharacterCard } from '@/lib/png-parser';

// ---------- 构造器 ----------

const card = { spec: 'chara_card_v2', data: { name: '赫敏' } } as unknown as STCharacterCard;

function makeSession(title: string): ChatSession {
  const raws: STRawMessage[] = [
    { name: '我', is_user: true, send_date: 1, mes: '你好' },
    { name: '角色', is_user: false, send_date: 2, mes: '嗯。' },
  ];
  const messages: ChatMessage[] = raws.map((r, i) => ({
    id: `m${i}`,
    role: r.is_user ? 'user' : 'assistant',
    content: String(r.mes),
    name: r.name,
    rawData: r,
  }));
  return {
    id: `sess_${title}`,
    title,
    messages,
    character: { name: '角色' },
    user: { name: '我' },
    createdAt: 1,
    rawMetadata: { user_name: '我', character_name: '角色' },
  };
}

function makeChar(id: string, name: string, extra: Partial<ArchiveCharacter> = {}): ArchiveCharacter {
  return { id, name, card, tags: [], status: '未开始', createdAt: 1, updatedAt: 1, ...extra };
}

function makeBranch(id: string, name: string): StoryBranch {
  return { id, name, session: makeSession(name), markers: [], createdAt: 1, updatedAt: 1 };
}

function makeStory(id: string, title: string, extra: Partial<ArchiveStory> = {}): ArchiveStory {
  return {
    id,
    title,
    session: makeSession(title),
    markers: [],
    meta: { modelsUsed: [], playTimeMs: null },
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  };
}

function makeSummary(id: string, kind: SummaryKind, title: string, bookId: string | null, extra: Partial<SummaryItem> = {}): SummaryItem {
  return {
    id,
    bookId,
    bookTitle: '书',
    kind,
    title,
    floorStart: 0,
    floorEnd: 3,
    content: '# 总结正文\n\n第一段',
    genParams: { model: 'claude', worldbookUids: [1, 2] },
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  };
}

function makeWorldbook(id: string, title: string, mark: number, updatedAt = 1): WorldBookItem {
  const entry = { uid: 0, comment: '设定', content: '正文', 自定义键: true } as unknown as WorldBookEntry;
  return {
    id,
    title,
    worldbook: { entries: { '0': entry }, originalData: { name: title, description: '原顶层键', mark } },
    createdAt: 1,
    updatedAt,
  };
}

function setup() {
  const fs = createMemFs();
  const vault = createVault(fs);
  return { fs, vault };
}

// ---------- 测试 ----------

describe('vault 角色映射', () => {
  it('put/get 往返：pngBase64 与档案.json 手塞的自定义键都存活', async () => {
    const { fs, vault } = setup();
    const repo = vault.repo<ArchiveCharacter>('characters');
    await repo.put(makeChar('c1', '赫敏', { pngBase64: 'aGk=' }));
    // 档案.json 不含 pngBase64（原图单独存 卡片.png 二进制）
    expect(JSON.parse(await fs.readText('角色/赫敏/档案.json')).pngBase64).toBeUndefined();
    expect(fs.dump()['角色/赫敏/卡片.png']).toBe('<binary>');
    // 用户直接改 档案.json 手塞自定义键
    const raw = JSON.parse(await fs.readText('角色/赫敏/档案.json'));
    raw.我的备注 = '手动加的字段';
    await fs.writeText('角色/赫敏/档案.json', JSON.stringify(raw, null, 2));
    const got = await repo.get('c1');
    expect(got!.pngBase64).toBe('aGk=');
    expect((got as unknown as Record<string, unknown>).我的备注).toBe('手动加的字段');
    // 记录对象随身携带未知键，再 put 后依然在
    await repo.put({ ...got!, updatedAt: 2 });
    const again = await repo.get('c1');
    expect((again as unknown as Record<string, unknown>).我的备注).toBe('手动加的字段');
    expect(again!.pngBase64).toBe('aGk=');
  });

  it('name 改变 → 文件夹改名，用户手放的文件跟着搬', async () => {
    const { fs, vault } = setup();
    const repo = vault.repo<ArchiveCharacter>('characters');
    await repo.put(makeChar('c1', '赫敏'));
    await fs.writeText('角色/赫敏/立绘/正装.txt', 'x'); // 用户自己放的
    await repo.put(makeChar('c1', '赫敏·格兰杰', { updatedAt: 2 }));
    expect((await fs.stat('角色/赫敏')).exists).toBe(false);
    expect(await fs.readText('角色/赫敏·格兰杰/立绘/正装.txt')).toBe('x');
    expect((await repo.get('c1'))!.name).toBe('赫敏·格兰杰');
  });
});

describe('vault 故事映射', () => {
  it('绑定进角色文件夹、未绑定进临时；故事.json 真源往返；派生 jsonl 合法', async () => {
    const { fs, vault } = setup();
    await vault.repo<ArchiveCharacter>('characters').put(makeChar('c1', '赫敏'));
    const stories = vault.repo<ArchiveStory>('archiveStories');
    const bound = makeStory('st1', '主线', { characterId: 'c1', branches: [makeBranch('b1', '告白失败线')] });
    await stories.put(bound);
    await stories.put(makeStory('st2', '路边捡的'));
    // 落位
    expect((await fs.stat('角色/赫敏/故事/主线/故事.json')).exists).toBe(true);
    expect((await fs.stat('临时/路边捡的/故事.json')).exists).toBe(true);
    // 故事.json 唯一真源，全记录无损（含 session/branches）
    expect(await stories.get('st1')).toEqual(bound);
    // 派生 ST 工作版：首行元数据合法、可被 parseJsonl 互逆解析
    const chat = await fs.readText('角色/赫敏/故事/主线/聊天.jsonl');
    expect(JSON.parse(chat.split('\n')[0]).user_name).toBe('我');
    const parsed = parseJsonl(chat);
    expect(parsed.metadata?.character_name).toBe('角色');
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[0].content).toBe('你好');
    expect((await fs.stat('角色/赫敏/故事/主线/分支·告白失败线.jsonl')).exists).toBe(true);
  });

  it('绑定状态变化 → 文件夹搬家；分支改名后旧派生文件清掉', async () => {
    const { fs, vault } = setup();
    await vault.repo<ArchiveCharacter>('characters').put(makeChar('c1', '赫敏'));
    const stories = vault.repo<ArchiveStory>('archiveStories');
    const story = makeStory('st1', '主线', { branches: [makeBranch('b1', '旧分支名')] });
    await stories.put(story);
    expect((await fs.stat('临时/主线')).exists).toBe(true);
    // 绑定 + 分支改名
    await stories.put({ ...story, characterId: 'c1', branches: [makeBranch('b1', '新分支名')], updatedAt: 2 });
    expect((await fs.stat('临时/主线')).exists).toBe(false);
    expect((await fs.stat('角色/赫敏/故事/主线/故事.json')).exists).toBe(true);
    expect((await fs.stat('角色/赫敏/故事/主线/分支·新分支名.jsonl')).exists).toBe(true);
    expect((await fs.stat('角色/赫敏/故事/主线/分支·旧分支名.jsonl')).exists).toBe(false);
  });
});

describe('vault 总结映射', () => {
  it('三种 kind 文件名标签正确 + frontmatter 无损往返 + 孤儿进 临时/记录/', async () => {
    const { fs, vault } = setup();
    await vault.repo<ArchiveStory>('archiveStories').put(makeStory('st1', '主线'));
    const sums = vault.repo<SummaryItem>('summaries');
    const s1 = makeSummary('s1', 'volume', '卷一', 'st1', { volumeNumber: 1 });
    await sums.put(s1);
    await sums.put(makeSummary('s2', 'diary', '小日记', 'st1'));
    await sums.put(makeSummary('s3', 'diy', '同人诗', '解析不到的书id'));
    const dump = fs.dump();
    expect(dump['临时/主线/分卷总结·卷一.md']).toBeDefined();
    expect(dump['临时/主线/角色日记·小日记.md']).toBeDefined();
    expect(dump['临时/记录/DIY 创作·同人诗.md']).toBeDefined();
    // frontmatter=除 content 外全部字段（含嵌套 genParams），body=content
    expect(await sums.get('s1')).toEqual(s1);
    expect(dump['临时/主线/分卷总结·卷一.md']).toContain('volumeNumber: 1');
  });
});

describe('vault 资产映射（__ste 往返）', () => {
  it('世界书：ST 兼容顶层 + entries + __ste，回读无损', async () => {
    const { fs, vault } = setup();
    const wbs = vault.repo<WorldBookItem>('worldbooks');
    const wb = makeWorldbook('wb1', '魔法世界', 1);
    await wbs.put(wb);
    expect(await wbs.get('wb1')).toEqual(wb);
    const file = JSON.parse(await fs.readText('资产/世界书/魔法世界.json'));
    expect(file.description).toBe('原顶层键'); // originalData 键直接在顶层（ST 可导入）
    expect(file.entries['0'].comment).toBe('设定');
    expect(file.__ste.id).toBe('wb1');
  });

  it('预设：exportPreset 全量 ST JSON + __ste，回读经 parsePreset 重建无损', async () => {
    const { fs, vault } = setup();
    const presets = vault.repo<PresetItem>('presets');
    const stJson = {
      prompts: [{ identifier: 'main', name: '主提示', role: 'system', content: 'hi', 自定义字段: 1 }],
      prompt_order: [{ character_id: 100000, order: [{ identifier: 'main', enabled: true }] }],
      temperature: 0.7,
      未知顶层: { a: 1 },
    };
    const item: PresetItem = { id: 'p1', title: '默认预设', preset: parsePreset(stJson), createdAt: 1, updatedAt: 1 };
    await presets.put(item);
    expect(await presets.get('p1')).toEqual(item);
    const file = JSON.parse(await fs.readText('资产/预设/默认预设.json'));
    expect(file.temperature).toBe(0.7); // originalData 拼回顶层
    expect(file.prompts[0].自定义字段).toBe(1);
    expect(file.__ste.title).toBe('默认预设');
  });

  it('正则：{ __ste, rules } 往返无损', async () => {
    const { vault } = setup();
    const regexes = vault.repo<RegexCollectionItem>('regexes');
    const rc: RegexCollectionItem = {
      id: 'r1',
      title: '去括号',
      rules: [{ id: 'x', name: '规则', findRegex: '\\(.*?\\)', replaceString: '', placement: ['all'], disabled: false, _raw: { markdownOnly: true } }],
      createdAt: 1,
      updatedAt: 1,
    };
    await regexes.put(rc);
    expect(await regexes.get('r1')).toEqual(rc);
  });

  it('处理区暂存卡：JSON 去 pngBase64 + 旁放同名 png', async () => {
    const { fs, vault } = setup();
    const cards = vault.repo<CardItem>('cards');
    const item: CardItem = { id: 'card1', title: '暂存卡', card, pngBase64: 'aGk=', createdAt: 1, updatedAt: 1 };
    await cards.put(item);
    expect(fs.dump()['临时/卡片/暂存卡.png']).toBe('<binary>');
    expect(JSON.parse(await fs.readText('临时/卡片/暂存卡.json')).pngBase64).toBeUndefined();
    expect(await cards.get('card1')).toEqual(item);
  });
});

describe('vault 删除守则', () => {
  it('remove 角色只删规格内文件：用户手放的文件和文件夹存活', async () => {
    const { fs, vault } = setup();
    const chars = vault.repo<ArchiveCharacter>('characters');
    await chars.put(makeChar('c1', '赫敏', { pngBase64: 'aGk=' }));
    await fs.writeText('角色/赫敏/我的笔记.md', '感想'); // 用户自己放的
    await chars.remove('c1');
    expect((await fs.stat('角色/赫敏/档案.json')).exists).toBe(false);
    expect((await fs.stat('角色/赫敏/卡片.png')).exists).toBe(false);
    expect(await fs.readText('角色/赫敏/我的笔记.md')).toBe('感想');
    expect((await fs.stat('角色/赫敏')).isDir).toBe(true);
    expect(await chars.list()).toEqual([]);
    // 没有用户文件时文件夹随之收走
    await chars.put(makeChar('c2', '罗恩'));
    await chars.remove('c2');
    expect((await fs.stat('角色/罗恩')).exists).toBe(false);
  });
});

describe('vault 重名与排序', () => {
  it('同 store 重名标题加 ·2，两条记录不互相覆盖', async () => {
    const { fs, vault } = setup();
    const wbs = vault.repo<WorldBookItem>('worldbooks');
    await wbs.put(makeWorldbook('wb1', '同名', 1));
    await wbs.put(makeWorldbook('wb2', '同名', 2));
    expect(fs.dump()['资产/世界书/同名.json']).toBeDefined();
    expect(fs.dump()['资产/世界书/同名·2.json']).toBeDefined();
    expect((await wbs.get('wb1'))!.worldbook.originalData!.mark).toBe(1);
    expect((await wbs.get('wb2'))!.worldbook.originalData!.mark).toBe(2);
    expect(await wbs.list()).toHaveLength(2);
    // 未绑定故事同名同理（文件夹级）
    const stories = vault.repo<ArchiveStory>('archiveStories');
    await stories.put(makeStory('st1', '同题'));
    await stories.put(makeStory('st2', '同题'));
    expect((await fs.stat('临时/同题/故事.json')).exists).toBe(true);
    expect((await fs.stat('临时/同题·2/故事.json')).exists).toBe(true);
  });

  it('list 按 updatedAt 降序', async () => {
    const { vault } = setup();
    const wbs = vault.repo<WorldBookItem>('worldbooks');
    await wbs.put(makeWorldbook('a', '甲', 0, 10));
    await wbs.put(makeWorldbook('b', '乙', 0, 30));
    await wbs.put(makeWorldbook('c', '丙', 0, 20));
    expect((await wbs.list()).map((w) => w.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('vault 重开库', () => {
  it('新实例首次访问全量扫描重建索引（角色/故事/孤儿总结/资产都找得回）', async () => {
    const { fs, vault } = setup();
    await vault.repo<ArchiveCharacter>('characters').put(makeChar('c1', '赫敏'));
    await vault.repo<ArchiveStory>('archiveStories').put(makeStory('st1', '主线', { characterId: 'c1' }));
    await vault.repo<SummaryItem>('summaries').put(makeSummary('s3', 'diy', '同人诗', null));
    await vault.repo<WorldBookItem>('worldbooks').put(makeWorldbook('wb1', '魔法世界', 1));
    const reopened = createVault(fs); // 同一份文件、全新索引
    expect((await reopened.repo<ArchiveCharacter>('characters').list()).map((c) => c.id)).toEqual(['c1']);
    expect((await reopened.repo<ArchiveStory>('archiveStories').get('st1'))!.title).toBe('主线');
    expect((await reopened.repo<SummaryItem>('summaries').get('s3'))!.content).toBe('# 总结正文\n\n第一段');
    expect((await reopened.repo<WorldBookItem>('worldbooks').get('wb1'))!.title).toBe('魔法世界');
  });
});

describe('vault pathOf/fs 旁路（7.2 遗留：立绘等库内旁路文件）', () => {
  it('pathOf 返回记录所在相对路径；未知 id/不支持 store 为 undefined', async () => {
    const fs = createMemFs();
    const vault = createVault(fs);
    await vault.repo<ArchiveCharacter>('characters').put(makeChar('c1', '赫敏'));
    expect(await vault.pathOf('characters', 'c1')).toBe('角色/赫敏');
    expect(await vault.pathOf('characters', '不存在')).toBeUndefined();
    expect(await vault.pathOf('books', 'x')).toBeUndefined();
    // fs 暴露给组件读旁路文件（立绘）
    await fs.writeBinary('角色/赫敏/立绘/正装.png', 'aGk=');
    const entries = await vault.fs.list('角色/赫敏/立绘');
    expect(entries.map((e) => e.name)).toEqual(['正装.png']);
  });
});
