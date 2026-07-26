/**
 * 小说视图管道单测（阶段6）：楼内拆句重排 / 用户楼层档位 / 场景分隔符 / 章节切分 / AI 章节建议解析。
 */
import { describe, it, expect } from 'vitest';
import {
  splitSegments,
  reflowContent,
  messageTimeMs,
  buildNovelDocument,
  buildChapterSuggestMessages,
  parseChapterSuggestions,
  type NovelViewOptions,
} from '@/lib/novel-view';
import type { ChatMessage, ChapterMarker } from '@/types/chat';
import type { ChatSession } from '@/types/chat';
import type { SummaryItem } from '@/types/summary';

const msg = (i: number, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `m${i}`,
  role: 'assistant',
  content: `第${i}楼叙述。`,
  ...over,
});

const opts = (over: Partial<NovelViewOptions> = {}): NovelViewOptions => ({
  userMode: 'weaken',
  sceneGapMinutes: 30,
  regexRules: [],
  ...over,
});

describe('splitSegments / reflowContent', () => {
  it('中文引号对白独立成段，星号旁白去星并入叙述', () => {
    const segs = splitSegments('*她抬起头* 「你来了。」她合上书。');
    expect(segs).toEqual([
      { type: 'narration', text: '她抬起头' },
      { type: 'dialogue', text: '「你来了。」' },
      { type: 'narration', text: '她合上书。' },
    ]);
  });

  it('相邻叙述碎片合并为一段', () => {
    const segs = splitSegments('*风吹过* *树叶沙沙作响*');
    expect(segs).toEqual([{ type: 'narration', text: '风吹过 树叶沙沙作响' }]);
  });

  it('弯引号与直引号都认', () => {
    const segs = splitSegments('“Hello.” he said. "Bye."');
    expect(segs.map((s) => s.type)).toEqual(['dialogue', 'narration', 'dialogue']);
  });

  it('未闭合引号按叙述处理不丢字', () => {
    const segs = splitSegments('「未闭合的话');
    expect(segs).toEqual([{ type: 'narration', text: '「未闭合的话' }]);
  });

  it('reflowContent 去 HTML/代码块，按空行分段', () => {
    const segs = reflowContent('<div class="statusbar">HP:100</div>```\ncode\n```旁白一段。\n\n「对白。」');
    expect(segs).toEqual([
      { type: 'narration', text: 'HP:100旁白一段。' },
      { type: 'dialogue', text: '「对白。」' },
    ]);
  });
});

describe('messageTimeMs', () => {
  it('timestamp 优先，回退 rawData 的 ST 日期', () => {
    expect(messageTimeMs(msg(0, { timestamp: 1234 }))).toBe(1234);
    const t = messageTimeMs(msg(0, { rawData: { send_date: '2026-6-1 @12h 00m 00s' } }));
    expect(t).toBe(new Date(2026, 5, 1, 12, 0, 0).getTime());
    expect(messageTimeMs(msg(0))).toBeUndefined();
  });
});

describe('buildNovelDocument', () => {
  it('系统/隐藏/OOC 楼被清洗掉', () => {
    const messages = [
      msg(0),
      msg(1, { role: 'system', content: '系统' }),
      msg(2, { hidden: true }),
      msg(3, { rawData: { extra: { type: 'comment' } } }),
      msg(4),
    ];
    const doc = buildNovelDocument(messages, [], opts());
    const floors = doc.flatMap((c) => c.blocks).map((b) => b.floor);
    expect(floors).toEqual([0, 4]);
  });

  it('用户楼层三档位：weaken 降为 user 块 / hide 跳过 / keep 正常拆', () => {
    const messages = [msg(0), msg(1, { role: 'user', content: '「我说。」我做了动作。' })];
    const weaken = buildNovelDocument(messages, [], opts({ userMode: 'weaken' }));
    expect(weaken[0].blocks.filter((b) => b.type === 'user').length).toBe(2);
    const hide = buildNovelDocument(messages, [], opts({ userMode: 'hide' }));
    expect(hide[0].blocks.every((b) => b.floor === 0)).toBe(true);
    const keep = buildNovelDocument(messages, [], opts({ userMode: 'keep' }));
    expect(keep[0].blocks.map((b) => b.type)).toEqual(['narration', 'dialogue', 'narration']);
  });

  it('楼间隔超阈值插场景分隔符，未超不插', () => {
    const base = Date.UTC(2026, 0, 1);
    const messages = [
      msg(0, { timestamp: base }),
      msg(1, { timestamp: base + 10 * 60_000 }),
      msg(2, { timestamp: base + 70 * 60_000 }),
    ];
    const doc = buildNovelDocument(messages, [], opts({ sceneGapMinutes: 30 }));
    const breaks = doc[0].blocks.filter((b) => b.type === 'scene-break');
    expect(breaks).toHaveLength(1);
    expect(breaks[0].floor).toBe(2);
    const off = buildNovelDocument(messages, [], opts({ sceneGapMinutes: 0 }));
    expect(off[0].blocks.some((b) => b.type === 'scene-break')).toBe(false);
  });

  it('章节标记切章：开头无标记成无题章，标记带卷名', () => {
    const markers: ChapterMarker[] = [
      { messageId: 'm2', messageIndex: 2, title: '重逢', volume: '卷一', createdAt: 0 },
    ];
    const doc = buildNovelDocument([msg(0), msg(1), msg(2), msg(3)], markers, opts());
    expect(doc).toHaveLength(2);
    expect(doc[0].title).toBeUndefined();
    expect(doc[0].startFloor).toBe(0);
    expect(doc[0].endFloor).toBe(1);
    expect(doc[1].title).toBe('卷一 · 重逢');
    expect(doc[1].startFloor).toBe(2);
    expect(doc[1].endFloor).toBe(3);
  });
});

describe('章节层 AI', () => {
  const session = (n: number): ChatSession => ({
    id: 's1',
    title: '主线',
    messages: Array.from({ length: n }, (_, i) => msg(i)),
    character: { name: 'C' },
    user: { name: 'U' },
    createdAt: 0,
  });

  it('有分卷总结时进提示词，抽样楼层带楼号', () => {
    const sums = [{ volumeNumber: 1, floorStart: 0, floorEnd: 9, content: '第一卷剧情' } as SummaryItem];
    const messages = buildChapterSuggestMessages({ session: session(20), volumeSummaries: sums, maxProbes: 5 });
    expect(messages[1].content).toContain('第一卷剧情');
    expect(messages[1].content).toContain('#0：');
    expect(messages[0].content).toContain('JSON');
  });

  it('parseChapterSuggestions：越界/重复/0 楼被过滤，按楼层升序', () => {
    const text = '建议：```json\n[{"floor":30,"title":"后段"},{"floor":10,"title":"前段"},{"floor":10,"title":"重复"},{"floor":0,"title":"零"},{"floor":99,"title":"越界"}]\n```';
    const out = parseChapterSuggestions(text, 40);
    expect(out).toEqual([
      { floor: 10, title: '前段' },
      { floor: 30, title: '后段' },
    ]);
    expect(parseChapterSuggestions('无', 40)).toBeNull();
  });
});
