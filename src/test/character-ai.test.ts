/**
 * 角色页 AI 引擎单测（阶段6）：资料块组装 / 简介与评分 messages / JSON 解析 / 加权总分。
 */
import { describe, it, expect } from 'vitest';
import {
  buildCardBlock,
  buildWorldbookBlock,
  buildStoryExcerpt,
  buildIntroMessages,
  buildRatingMessages,
  describeReadScope,
  extractFirstJson,
  computeWeightedTotal,
  parseRatingResponse,
} from '@/lib/character-ai';
import { BUILTIN_RATING_TEMPLATE, copyRatingTemplate } from '@/lib/rating-templates';
import type { NormalizedCharacterCard } from '@/lib/png-parser';
import type { WorldBook } from '@/types/worldbook';
import type { ChatSession } from '@/types/chat';

const norm = (over: Partial<NormalizedCharacterCard> = {}): NormalizedCharacterCard => ({
  spec: 'v2',
  name: '赫敏',
  description: '聪明的魔法学生',
  personality: '理性、好胜',
  scenario: '霍格沃茨图书馆',
  firstMessage: '「你也来查资料吗？」',
  messageExample: '',
  creatorNotes: '',
  systemPrompt: '',
  postHistoryInstructions: '',
  alternateGreetings: [],
  groupOnlyGreetings: [],
  tags: ['魔法', '校园'],
  creator: '',
  characterVersion: '',
  nickname: '',
  assets: [],
  avatar: '',
  characterBook: undefined,
  raw: {},
  ...over,
});

const wb: WorldBook = {
  entries: {
    1: { uid: 1, key: [], keysecondary: [], comment: '魔法世界', content: '存在隐秘的魔法社会',
      constant: true, selective: false, order: 100, position: 0, disable: false, enabled: true,
      probability: 100, useProbability: false, depth: 4, role: 0 } as unknown as WorldBook['entries'][number],
    2: { uid: 2, key: [], keysecondary: [], comment: '', content: '',
      constant: false, selective: false, order: 90, position: 0, disable: false, enabled: false,
      probability: 100, useProbability: false, depth: 4, role: 0 } as unknown as WorldBook['entries'][number],
  },
} as unknown as WorldBook;

const session = (n: number): ChatSession => ({
  id: 's1',
  title: '主线',
  messages: Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
    content: `第${i}楼的内容，写得很长很长很长`,
  })),
  character: { name: '赫敏' },
  user: { name: '我' },
  createdAt: 0,
});

describe('buildCardBlock', () => {
  it('包含非空字段、跳过空字段、超长截断', () => {
    const block = buildCardBlock(norm({ personality: '' }), 5);
    expect(block).toContain('角色名：赫敏');
    expect(block).toContain('标签：魔法、校园');
    expect(block).toContain('Description');
    expect(block).not.toContain('Personality');
    expect(block).toContain('…（已截断）');
  });
});

describe('buildWorldbookBlock', () => {
  it('只取启用条目，带条目名前缀与标题', () => {
    const block = buildWorldbookBlock('霍格沃茨设定', wb);
    expect(block).toContain('【世界书：霍格沃茨设定】');
    expect(block).toContain('魔法世界：存在隐秘的魔法社会');
    expect(block.split('\n').length).toBe(2); // 禁用/空条目不进
  });
});

describe('buildStoryExcerpt', () => {
  it('均匀抽样并标楼层号', () => {
    const text = buildStoryExcerpt('主线', session(40), { maxMessages: 4, maxCharsPerMessage: 10 });
    expect(text).toContain('共 40 楼');
    expect(text).toContain('#0 我：');
    // 每楼截 10 字
    const line = text.split('\n')[1];
    expect(line.split('：')[1].length).toBeLessThanOrEqual(10);
  });
});

describe('buildIntroMessages / buildRatingMessages', () => {
  it('简介：readScope 记录卡+世界书，资料块进 user 消息', () => {
    const { messages, readScope } = buildIntroMessages({
      norm: norm(),
      worldbooks: [{ id: 'w1', title: '霍格沃茨设定', wb }],
    });
    expect(readScope).toEqual(['card', 'worldbook:w1']);
    expect(messages).toHaveLength(2);
    expect(messages[1].content).toContain('【世界书：霍格沃茨设定】');
  });

  it('评分：system 含模板提示词+维度清单+JSON 格式要求', () => {
    const { messages, readScope } = buildRatingMessages({
      template: BUILTIN_RATING_TEMPLATE,
      norm: norm(),
      stories: [{ id: 'st1', title: '主线', session: session(6) }],
    });
    expect(readScope).toContain('story:st1');
    expect(messages[0].content).toContain('设定完整度');
    expect(messages[0].content).toContain('"dimensions"');
    expect(messages[1].content).toContain('【故事节选：主线');
  });
});

describe('describeReadScope', () => {
  it('翻译各类范围，查不到名字给「已删除」', () => {
    const names = new Map([['w1', '霍格沃茨设定']]);
    expect(describeReadScope(['card', 'worldbook:w1', 'story:s9'], names))
      .toBe('角色卡 + 世界书「霍格沃茨设定」 + 故事「已删除」');
    expect(describeReadScope(undefined)).toBe('');
  });
});

describe('extractFirstJson', () => {
  it('抠出围栏里的 JSON 对象', () => {
    const text = '好的，评分如下：\n```json\n{"a":1,"b":"含}括号"}\n```\n以上';
    expect(extractFirstJson(text)).toEqual({ a: 1, b: '含}括号' });
  });
  it('数组与嵌套', () => {
    expect(extractFirstJson('前缀 [{"x":[1,2]}] 后缀')).toEqual([{ x: [1, 2] }]);
  });
  it('无 JSON 返回 null', () => {
    expect(extractFirstJson('没有任何结构化内容')).toBeNull();
  });
});

describe('computeWeightedTotal', () => {
  it('按权重加权并 0.5 步进', () => {
    // (8*3 + 6*1) / 4 = 7.5
    expect(computeWeightedTotal([
      { weight: 3, score: 8 },
      { weight: 1, score: 6 },
    ])).toBe(7.5);
  });
  it('权重全 0 退化为平均', () => {
    expect(computeWeightedTotal([
      { weight: 0, score: 4 },
      { weight: 0, score: 6 },
    ])).toBe(5);
  });
  it('空数组为 0', () => {
    expect(computeWeightedTotal([])).toBe(0);
  });
});

describe('parseRatingResponse', () => {
  const tpl = BUILTIN_RATING_TEMPLATE;

  it('按维度名对齐，分数夹 0~10，算加权总分', () => {
    const dims = tpl.dimensions.map((d) => ({ name: d.name, score: 8, reason: `${d.name}不错` }));
    dims[0].score = 15; // 越界 → 10
    const out = parseRatingResponse(JSON.stringify({ dimensions: dims, note: '整体优秀' }), tpl);
    expect(out).not.toBeNull();
    expect(out!.dimensions[0].score).toBe(10);
    expect(out!.dimensions[0].name).toBe(tpl.dimensions[0].name);
    expect(out!.note).toBe('整体优秀');
    expect(out!.total).toBeGreaterThan(7);
  });

  it('AI 漏维度时占位 0 分并标注，名字乱序也能对上', () => {
    const reversed = [...tpl.dimensions].reverse().slice(0, 3)
      .map((d) => ({ name: d.name, score: 7 }));
    const out = parseRatingResponse(JSON.stringify({ dimensions: reversed }), tpl);
    expect(out!.dimensions).toHaveLength(tpl.dimensions.length);
    const missing = out!.dimensions.filter((d) => d.reason?.includes('未给出'));
    expect(missing.length).toBe(tpl.dimensions.length - 3);
    // 名字对齐：模板最后一个维度在 reversed 里有 7 分
    expect(out!.dimensions[tpl.dimensions.length - 1].score).toBe(7);
  });

  it('解析失败返回 null', () => {
    expect(parseRatingResponse('不是 JSON', tpl)).toBeNull();
    expect(parseRatingResponse('{"dimensions":[]}', tpl)).toBeNull();
  });
});

describe('copyRatingTemplate', () => {
  it('复制为可改副本：新 id、去「内置」后缀、深拷贝维度', () => {
    const copy = copyRatingTemplate(BUILTIN_RATING_TEMPLATE);
    expect(copy.id).not.toBe(BUILTIN_RATING_TEMPLATE.id);
    expect(copy.builtin).toBeUndefined();
    expect(copy.title).toContain('副本');
    copy.dimensions[0].weight = 99;
    expect(BUILTIN_RATING_TEMPLATE.dimensions[0].weight).not.toBe(99);
  });
});
