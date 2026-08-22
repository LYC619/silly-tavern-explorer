/**
 * 「打开即全量重写」的写入面（阶段 D3）。
 *
 * 原本只为盖一个 lastViewedAt 时间戳：
 * - 访问角色页 → 整张卡 PNG 重写一遍
 * - 打开故事页 → 故事.json + 聊天.jsonl + 每条分支 jsonl 全部重新序列化
 *
 * 派生文件（卡片.png / 聊天.jsonl / 分支·*.jsonl）是纯派生的、只写不读，
 * 来源字段没变就没有重写的理由。这里数写入次数，不看内容——
 * 「少写了一次」只有计数能证明。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemFs } from '@/lib/vault/fs';
import { createVault } from '@/lib/vault/vault-backend';
import { setActiveVault } from '@/lib/vault/active';
import {
  saveCharacter,
  markCharacterViewed,
  updateCharacter,
  saveArchiveStory,
  updateArchiveStory,
  getArchiveStory,
} from '@/lib/archive-db';
import { parseJsonl } from '@/lib/adapters/st/chat-jsonl';
import type { ArchiveCharacter, ArchiveStory, StoryBranch } from '@/types/archive';
import type { ChatSession } from '@/types/chat';
import type { STCharacterCard } from '@/lib/png-parser';

const card = { spec: 'chara_card_v2', data: { name: '测试' } } as unknown as STCharacterCard;

function session(title: string, texts: string[]): ChatSession {
  return {
    id: `sess_${title}`,
    title,
    messages: texts.map((t, i) => ({
      id: `m${i}`,
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: t,
      rawData: { name: i % 2 === 0 ? '我' : '角色', is_user: i % 2 === 0, send_date: i, mes: t },
    })),
    character: { name: '角色' },
    user: { name: '我' },
    createdAt: 1,
    rawMetadata: { user_name: '我', character_name: '角色' },
  };
}

function makeStory(id: string, title: string, texts: string[], extra: Partial<ArchiveStory> = {}): ArchiveStory {
  return {
    id, title, session: session(title, texts), markers: [],
    meta: { modelsUsed: [], playTimeMs: null }, createdAt: 1, updatedAt: 1, ...extra,
  };
}

function makeChar(id: string, name: string, extra: Partial<ArchiveCharacter> = {}): ArchiveCharacter {
  return { id, name, card, tags: [], status: '未开始', createdAt: 1, updatedAt: 1, ...extra };
}

/** 记下每次写入的路径，用来数「有没有重写派生文件」 */
function recordingMemFs() {
  const fs = createMemFs();
  const writes: string[] = [];
  return {
    writes,
    inner: fs,
    fs: {
      ...fs,
      writeText: async (path: string, text: string) => {
        writes.push(path);
        return fs.writeText(path, text);
      },
      writeBinary: async (path: string, b64: string) => {
        writes.push(path);
        return fs.writeBinary(path, b64);
      },
    },
  };
}

const endingWith = (writes: string[], suffix: string) => writes.filter((p) => p.endsWith(suffix));

beforeEach(() => setActiveVault(null));
afterEach(() => setActiveVault(null));

describe('角色：只盖时间戳不重写卡面', () => {
  it('markCharacterViewed 不重写 卡片.png，档案.json 照常更新', async () => {
    const { fs, writes } = recordingMemFs();
    setActiveVault(createVault(fs));
    await saveCharacter(makeChar('c1', '赫敏', { pngBase64: 'PNGDATA' }));

    writes.length = 0;
    const viewed = await markCharacterViewed('c1', 8888);

    expect(viewed?.lastViewedAt).toBe(8888);
    expect(endingWith(writes, '卡片.png')).toHaveLength(0);
    expect(endingWith(writes, '档案.json')).toHaveLength(1);
  });

  it('真的换了卡面时照旧重写 卡片.png', async () => {
    const { fs, writes, inner } = recordingMemFs();
    setActiveVault(createVault(fs));
    await saveCharacter(makeChar('c1', '赫敏', { pngBase64: 'OLD' }));

    writes.length = 0;
    await updateCharacter('c1', () => ({ pngBase64: 'NEW' }));

    expect(endingWith(writes, '卡片.png')).toHaveLength(1);
    expect(await inner.readBinary('角色/赫敏/卡片.png')).toBe('NEW');
  });

  it('记录不再带卡面时仍然把 卡片.png 删掉', async () => {
    const { fs, inner } = recordingMemFs();
    setActiveVault(createVault(fs));
    await saveCharacter(makeChar('c1', '赫敏', { pngBase64: 'OLD' }));

    await updateCharacter('c1', () => ({ pngBase64: undefined }));

    expect((await inner.stat('角色/赫敏/卡片.png')).exists).toBe(false);
  });
});

describe('故事：只盖时间戳不重生成 ST 工作版', () => {
  const branch: StoryBranch = {
    id: 'b1', name: '告白线', session: session('告白线', ['分支一楼']), markers: [], createdAt: 1, updatedAt: 1,
  };

  it('打开故事盖 lastViewedAt 时，聊天.jsonl 与分支 jsonl 都不重写', async () => {
    const { fs, writes } = recordingMemFs();
    setActiveVault(createVault(fs));
    await saveArchiveStory(makeStory('s1', '主线', ['一楼', '二楼'], { branches: [branch] }));

    writes.length = 0;
    await updateArchiveStory('s1', () => ({ lastViewedAt: 7777, lastViewedBranchId: 'b1' }));

    // 真源必须写，派生的不写
    expect(endingWith(writes, '故事.json')).toHaveLength(1);
    expect(endingWith(writes, '聊天.jsonl')).toHaveLength(0);
    expect(endingWith(writes, '分支·告白线.jsonl')).toHaveLength(0);
  });

  it('改了正文就照旧重生成派生文件，且内容跟得上真源', async () => {
    const { fs, writes, inner } = recordingMemFs();
    setActiveVault(createVault(fs));
    await saveArchiveStory(makeStory('s1', '主线', ['一楼', '二楼'], { branches: [branch] }));

    writes.length = 0;
    await updateArchiveStory('s1', (cur) => ({
      session: { ...cur.session, messages: [...cur.session.messages, {
        id: 'm2', role: 'user' as const, content: '三楼',
        rawData: { name: '我', is_user: true, send_date: 3, mes: '三楼' },
      }] },
    }));

    expect(endingWith(writes, '聊天.jsonl')).toHaveLength(1);
    const jsonl = await inner.readText('临时/主线/聊天.jsonl');
    expect(parseJsonl(jsonl).messages).toHaveLength(3);
    expect((await getArchiveStory('s1'))?.session.messages).toHaveLength(3);
  });

  it('只改标题（文件夹跟着改名）时，派生文件随文件夹搬走而不是重写', async () => {
    const { fs, writes, inner } = recordingMemFs();
    setActiveVault(createVault(fs));
    await saveArchiveStory(makeStory('s1', '旧标题', ['一楼', '二楼']));

    writes.length = 0;
    await updateArchiveStory('s1', () => ({ title: '新标题' }));

    expect(endingWith(writes, '聊天.jsonl')).toHaveLength(0);
    // 改名靠 rename 整个文件夹，派生文件跟着走，内容仍在
    expect(parseJsonl(await inner.readText('临时/新标题/聊天.jsonl')).messages).toHaveLength(2);
    expect((await inner.stat('临时/旧标题/聊天.jsonl')).exists).toBe(false);
  });
});
