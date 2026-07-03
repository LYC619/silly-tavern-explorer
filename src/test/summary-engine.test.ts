import { describe, it, expect } from 'vitest';
import {
  buildSummaryMessages,
  insertAtDepth,
  collectWorldbookEntries,
  buildPriorBlock,
  extractTitle,
  type SummaryEngineInput,
} from '@/lib/summary-engine';
import type { ChatSession } from '@/types/chat';
import type { WorldBook, WorldBookEntry } from '@/types/worldbook';
import type { NormalizedPreset } from '@/types/preset';
import type { SummaryItem } from '@/types/summary';
import { DEFAULT_CHARACTER_ID } from '@/types/preset';

// ---- fixtures ----

function makeSession(): ChatSession {
  return {
    id: 's1',
    title: '测试会话',
    character: { name: '爱丽丝' },
    user: { name: '我' },
    createdAt: 0,
    messages: [
      { id: 'm0', role: 'user', content: '你好', is_user: true },
      { id: 'm1', role: 'assistant', content: '你好呀' },
      { id: 'm2', role: 'user', content: '今天天气不错', is_user: true },
      { id: 'm3', role: 'assistant', content: '是啊，适合散步' },
    ],
  };
}

function makeEntry(partial: Partial<WorldBookEntry>): WorldBookEntry {
  return {
    uid: 0, key: [], keysecondary: [], comment: '', content: '',
    constant: false, vectorized: false, selective: false, selectiveLogic: 0,
    enabled: true, position: 0, depth: 4, order: 100, probability: 100,
    group: '', groupOverride: false, groupWeight: 100, sticky: 0, cooldown: 0,
    delay: 0, role: 0, scanDepth: null, caseSensitive: null, matchWholeWords: null,
    useGroupScoring: null, automationId: '', excludeRecursion: false,
    preventRecursion: false, delayUntilRecursion: false, displayIndex: 0,
    ...partial,
  };
}

function makeWorldbook(entries: WorldBookEntry[]): WorldBook {
  const rec: Record<string, WorldBookEntry> = {};
  entries.forEach((e) => { rec[String(e.uid)] = e; });
  return { entries: rec };
}

const baseInput = (): SummaryEngineInput => ({
  session: makeSession(),
  floorStart: 0,
  floorEnd: 3,
  template: '请总结 {{char}} 与 {{user}} 的对话。',
});

// ---- 无预设骨架 ----

describe('buildSummaryMessages — 无预设骨架', () => {
  it('楼层消息 + D0 模板，宏替换生效', () => {
    const { messages } = buildSummaryMessages(baseInput());
    // 4 条楼层 + 1 条模板
    expect(messages).toHaveLength(5);
    const last = messages[messages.length - 1];
    expect(last.role).toBe('user');
    expect(last.content).toBe('请总结 爱丽丝 与 我 的对话。'); // 宏已替换
    // 楼层带说话人前缀（默认）
    expect(messages[0]).toEqual({ role: 'user', content: '我: 你好' });
    expect(messages[1]).toEqual({ role: 'assistant', content: '爱丽丝: 你好呀' });
  });

  it('speakerPrefix=false 时楼层不带前缀', () => {
    const { messages } = buildSummaryMessages({ ...baseInput(), options: { speakerPrefix: false } });
    expect(messages[0]).toEqual({ role: 'user', content: '你好' });
  });

  it('楼层区间截取正确（只取 1~2）', () => {
    const { messages } = buildSummaryMessages({ ...baseInput(), floorStart: 1, floorEnd: 2 });
    expect(messages).toHaveLength(3); // 2 楼层 + 模板
    expect(messages[0].content).toBe('爱丽丝: 你好呀');
    expect(messages[1].content).toBe('我: 今天天气不错');
  });

  it('挂世界书 constant 模式：仅常驻条目进【世界观设定】系统块', () => {
    const wb = makeWorldbook([
      makeEntry({ uid: 1, constant: true, position: 0, content: '常驻设定A' }),
      makeEntry({ uid: 2, constant: false, position: 0, content: '非常驻设定B' }),
    ]);
    const { messages } = buildSummaryMessages({ ...baseInput(), worldbook: wb, worldbookMode: 'constant' });
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('常驻设定A');
    expect(messages[0].content).not.toContain('非常驻设定B');
  });

  it('世界书 position=6 (@depth) 条目按深度插入楼层，不进静态块', () => {
    const wb = makeWorldbook([
      makeEntry({ uid: 1, constant: true, position: 6, depth: 1, role: 0, content: '深度注入X' }),
    ]);
    const { messages } = buildSummaryMessages({ ...baseInput(), worldbook: wb, worldbookMode: 'all' });
    // 无静态块（唯一条目是 @depth）→ 首条应是楼层，@depth 插在倒数第1楼之前
    const injected = messages.find((m) => m.content.includes('深度注入X'));
    expect(injected).toBeDefined();
    expect(injected!.role).toBe('system');
    // depth=1 → 插到楼层末尾消息之前（模板之外）
    const idx = messages.indexOf(injected!);
    // 楼层共4条，注入在倒数第1楼(m3)前 = 第4个楼层消息前
    expect(messages[idx + 1].content).toBe('爱丽丝: 是啊，适合散步');
  });

  it('前情存档块在挂预设外也注入（无预设骨架第二块）', () => {
    const priors: SummaryItem[] = [{
      id: 'v1', bookId: 'b', bookTitle: 'T', kind: 'volume', title: '开端',
      volumeNumber: 1, floorStart: 0, floorEnd: 9, content: '第一卷发生的事',
      createdAt: 0, updatedAt: 0,
    }];
    const { messages } = buildSummaryMessages({ ...baseInput(), priorSummaries: priors, volumeNumber: 2 });
    const prior = messages.find((m) => m.content.includes('前情存档'));
    expect(prior).toBeDefined();
    expect(prior!.content).toContain('第1卷 - 开端');
    expect(prior!.content).toContain('第一卷发生的事');
  });

  it('{{volume}} 宏替换为卷号', () => {
    const { messages } = buildSummaryMessages({
      ...baseInput(),
      template: '第{{volume}}卷总结',
      volumeNumber: 3,
    });
    expect(messages[messages.length - 1].content).toBe('第3卷总结');
  });
});

// ---- 挂预设展开 ----

function makePreset(): NormalizedPreset {
  return {
    prompts: [
      { identifier: 'main', name: 'Main', role: 'system', content: '你是总结助手', system_prompt: true },
      { identifier: 'worldInfoBefore', name: 'WIB', marker: true },
      { identifier: 'chatHistory', name: 'Chat', marker: true },
      { identifier: 'jailbreak', name: 'JB', role: 'system', content: '保持客观' },
    ],
    promptOrder: [{
      character_id: DEFAULT_CHARACTER_ID,
      order: [
        { identifier: 'main', enabled: true },
        { identifier: 'worldInfoBefore', enabled: true },
        { identifier: 'chatHistory', enabled: true },
        { identifier: 'jailbreak', enabled: true },
      ],
    }],
    regexRules: [],
    hasRegexExtension: false,
    originalData: { temperature: 0.5, top_p: 0.9 },
  };
}

describe('buildSummaryMessages — 挂预设展开', () => {
  it('按激活顺序展开：main → 楼层+模板(chatHistory) → jailbreak(post-history)', () => {
    const { messages } = buildSummaryMessages({ ...baseInput(), preset: makePreset() });
    const roles = messages.map((m) => m.content);
    // main 在最前
    expect(messages[0].content).toBe('你是总结助手');
    // jailbreak 在最后（post-history，模板之后）
    expect(messages[messages.length - 1].content).toBe('保持客观');
    // 模板（D0）在 jailbreak 之前
    const tplIdx = roles.findIndex((c) => c.includes('请总结'));
    const jbIdx = roles.indexOf('保持客观');
    expect(tplIdx).toBeGreaterThan(0);
    expect(jbIdx).toBeGreaterThan(tplIdx); // post-history 在模板之后
  });

  it('挂世界书经 worldInfoBefore 插槽注入', () => {
    const wb = makeWorldbook([makeEntry({ uid: 1, constant: true, position: 0, content: '世界观Z' })]);
    const { messages } = buildSummaryMessages({
      ...baseInput(), preset: makePreset(), worldbook: wb, worldbookMode: 'constant',
    });
    const wbMsg = messages.find((m) => m.content.includes('世界观Z'));
    expect(wbMsg).toBeDefined();
    // 在 main 之后、楼层之前
    const wbIdx = messages.indexOf(wbMsg!);
    const floorIdx = messages.findIndex((m) => m.content.includes('你好'));
    expect(wbIdx).toBeLessThan(floorIdx);
  });

  it('读取预设采样参数透传', () => {
    const { params } = buildSummaryMessages({ ...baseInput(), preset: makePreset() });
    expect(params).toEqual({ temperature: 0.5, top_p: 0.9 });
  });

  it('预设未启用 chatHistory → 兜底追加楼层+模板并告警', () => {
    const p = makePreset();
    p.promptOrder[0].order = p.promptOrder[0].order.filter((o) => o.identifier !== 'chatHistory');
    const { messages, warnings } = buildSummaryMessages({ ...baseInput(), preset: p });
    expect(warnings.some((w) => w.includes('聊天历史'))).toBe(true);
    expect(messages[messages.length - 1].content).toContain('请总结');
  });

  it('注入块 injection_position=1 按 @depth 插入楼层', () => {
    const p = makePreset();
    p.prompts.push({
      identifier: 'inj', name: 'Inj', role: 'system', content: '注入提示',
      injection_position: 1, injection_depth: 0,
    });
    p.promptOrder[0].order.push({ identifier: 'inj', enabled: true });
    const { messages } = buildSummaryMessages({ ...baseInput(), preset: p });
    const inj = messages.find((m) => m.content === '注入提示');
    expect(inj).toBeDefined();
    // depth=0 → 插到楼层末尾（最后一条楼层消息之后、模板之前）
    const injIdx = messages.indexOf(inj!);
    expect(messages[injIdx - 1].content).toBe('爱丽丝: 是啊，适合散步');
  });
});

// ---- 纯函数单测 ----

describe('insertAtDepth', () => {
  const floors = [
    { role: 'user' as const, content: 'a' },
    { role: 'assistant' as const, content: 'b' },
    { role: 'user' as const, content: 'c' },
  ];
  it('depth=0 追加到末尾', () => {
    const r = insertAtDepth(floors, { role: 'system', content: 'X' }, 0);
    expect(r[r.length - 1].content).toBe('X');
  });
  it('depth=1 插到倒数第1条之前', () => {
    const r = insertAtDepth(floors, { role: 'system', content: 'X' }, 1);
    expect(r[2].content).toBe('X');
    expect(r[3].content).toBe('c');
  });
  it('depth 超过长度 clamp 到开头', () => {
    const r = insertAtDepth(floors, { role: 'system', content: 'X' }, 99);
    expect(r[0].content).toBe('X');
  });
  it('不改入参', () => {
    insertAtDepth(floors, { role: 'system', content: 'X' }, 1);
    expect(floors).toHaveLength(3);
  });
});

describe('collectWorldbookEntries', () => {
  const wb = makeWorldbook([
    makeEntry({ uid: 1, constant: true, enabled: true }),
    makeEntry({ uid: 2, constant: false, enabled: true }),
    makeEntry({ uid: 3, constant: true, enabled: false }), // 禁用
  ]);
  it('constant 只取常驻且启用', () => {
    expect(collectWorldbookEntries(wb, 'constant').map((e) => e.uid)).toEqual([1]);
  });
  it('all 取全部启用', () => {
    expect(collectWorldbookEntries(wb, 'all').map((e) => e.uid).sort()).toEqual([1, 2]);
  });
  it('manual 取 uid 命中且启用', () => {
    expect(collectWorldbookEntries(wb, 'manual', [2, 3]).map((e) => e.uid)).toEqual([2]);
  });
});

describe('extractTitle', () => {
  it('分卷提取卷名', () => {
    expect(extractTitle('volume', '### 存档节点：第2卷 - 风起云涌\n概要...')).toBe('风起云涌');
  });
  it('日记提取首个加粗标题', () => {
    expect(extractTitle('diary', '开场白\n**难忘的一天**\n正文')).toBe('难忘的一天');
  });
  it('无匹配返回空串', () => {
    expect(extractTitle('diy', '一段没有标题的文字')).toBe('');
  });
});

describe('buildPriorBlock', () => {
  it('多卷拼接带卷号与楼层区间', () => {
    const priors: SummaryItem[] = [
      { id: 'a', bookId: 'b', bookTitle: 'T', kind: 'volume', title: '开端', volumeNumber: 1, floorStart: 0, floorEnd: 9, content: '内容1', createdAt: 0, updatedAt: 0 },
      { id: 'c', bookId: 'b', bookTitle: 'T', kind: 'volume', title: '发展', volumeNumber: 2, floorStart: 10, floorEnd: 19, content: '内容2', createdAt: 0, updatedAt: 0 },
    ];
    const block = buildPriorBlock(priors);
    expect(block).toContain('第1卷 - 开端 | 楼层 0~9');
    expect(block).toContain('第2卷 - 发展 | 楼层 10~19');
  });
});
