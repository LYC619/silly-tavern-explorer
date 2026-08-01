import { describe, it, expect } from 'vitest';
import type { ChatMessage } from '@/types/chat';
import {
  extractMessageModel,
  extractModels,
  estimatePlayTime,
  formatPlayTime,
  PLAY_SESSION_GAP_MS,
  computeWordCount,
  computeLastMessageAt,
  computeStoryProps,
} from '@/lib/story-meta';

function msg(partial: Partial<ChatMessage> & { rawData?: ChatMessage['rawData'] }): ChatMessage {
  return { id: Math.random().toString(36).slice(2), role: 'assistant', content: 'x', ...partial };
}

describe('extractMessageModel', () => {
  it('读顶层 extra.model', () => {
    expect(extractMessageModel({ extra: { model: 'claude-sonnet' } })).toBe('claude-sonnet');
  });

  it('重掷后优先当前 swipe_info[swipe_id] 的模型（顶层是旧值）', () => {
    expect(extractMessageModel({
      extra: { model: 'old-model' },
      swipe_id: 1,
      swipes: ['第一版', '第二版'],
      swipe_info: [
        { extra: { model: 'old-model' } },
        { extra: { model: 'gemini-2.5' } },
      ],
    })).toBe('gemini-2.5');
  });

  it('swipe_info 缺当前项时回退顶层', () => {
    expect(extractMessageModel({
      extra: { model: 'fallback-model' },
      swipe_id: 2,
      swipe_info: [{ extra: { model: 'a' } }],
    })).toBe('fallback-model');
  });

  it('无模型信息返回 undefined', () => {
    expect(extractMessageModel({})).toBeUndefined();
    expect(extractMessageModel(undefined)).toBeUndefined();
    expect(extractMessageModel({ extra: { model: 123 } })).toBeUndefined();
  });
});

describe('extractModels', () => {
  it('按首次出现顺序去重，lastModel 是最近一条', () => {
    const messages = [
      msg({ rawData: { extra: { model: 'A' } } }),
      msg({ rawData: { extra: { model: 'B' } } }),
      msg({ rawData: { extra: { model: 'A' } } }),
      msg({ rawData: {} }), // 无模型的楼层不影响
    ];
    const { modelsUsed, lastModel } = extractModels(messages);
    expect(modelsUsed).toEqual(['A', 'B']);
    expect(lastModel).toBe('A');
  });

  it('全无模型信息时为空', () => {
    const { modelsUsed, lastModel } = extractModels([msg({}), msg({ rawData: {} })]);
    expect(modelsUsed).toEqual([]);
    expect(lastModel).toBeUndefined();
  });
});

describe('estimatePlayTime', () => {
  const T0 = new Date('2026-01-01T20:00:00Z').getTime();
  const min = (n: number) => n * 60_000;

  it('连续消息合并为一个时段，时长=末-首', () => {
    const messages = [0, 5, 10, 12].map((m) =>
      msg({ rawData: { gen_finished: new Date(T0 + min(m)).toISOString() } }),
    );
    const est = estimatePlayTime(messages);
    expect(est).not.toBeNull();
    expect(est!.totalMs).toBe(min(12));
    expect(est!.sessionCount).toBe(1);
  });

  it('间隔超过阈值切成两个时段，间隔本身不计入时长', () => {
    // 0~10 分钟玩了一段，隔 3 小时又玩了 20~25 分钟段
    const gapStart = min(10) + 3 * 60 * 60_000;
    const messages = [0, min(5), min(10), gapStart, gapStart + min(5)].map((offset) =>
      msg({ rawData: { gen_finished: new Date(T0 + offset).toISOString() } }),
    );
    const est = estimatePlayTime(messages);
    expect(est!.sessionCount).toBe(2);
    expect(est!.totalMs).toBe(min(15)); // 10 + 5，中间 3 小时不算
  });

  it('恰好等于阈值不切段（>gap 才切）', () => {
    const messages = [0, PLAY_SESSION_GAP_MS].map((offset) =>
      msg({ rawData: { gen_finished: new Date(T0 + offset).toISOString() } }),
    );
    expect(estimatePlayTime(messages)!.sessionCount).toBe(1);
  });

  it('gen_finished 缺失回退 send_date（ST 奇葩格式）', () => {
    const messages = [
      msg({ rawData: { send_date: '2024-11-14 @06h 18m 30s 500ms' } }),
      msg({ rawData: { send_date: '2024-11-14 @06h 28m 30s 500ms' } }),
    ];
    const est = estimatePlayTime(messages);
    expect(est!.totalMs).toBe(min(10));
  });

  it('有效时间戳不足 2 条返回 null（UI 显示未统计）', () => {
    expect(estimatePlayTime([msg({})])).toBeNull();
    expect(estimatePlayTime([msg({ rawData: { gen_finished: new Date(T0).toISOString() } }), msg({})])).toBeNull();
    expect(estimatePlayTime([])).toBeNull();
  });

  it('乱序时间戳先排序再切段', () => {
    const messages = [min(10), 0, min(5)].map((offset) =>
      msg({ rawData: { gen_finished: new Date(T0 + offset).toISOString() } }),
    );
    expect(estimatePlayTime(messages)!.totalMs).toBe(min(10));
  });
});

describe('formatPlayTime', () => {
  const est = (totalMs: number) => ({ totalMs, sessionCount: 1, sampledMessages: 2 });

  it('null → 未统计', () => {
    expect(formatPlayTime(null)).toBe('未统计');
  });

  it('分钟/小时分档', () => {
    expect(formatPlayTime(est(30_000))).toBe('不足 1 分钟');
    expect(formatPlayTime(est(46 * 60_000))).toBe('46 分钟');
    expect(formatPlayTime(est(12.4 * 60 * 60_000))).toBe('12.4 小时');
    expect(formatPlayTime(est(15.63 * 60 * 60_000))).toBe('15.6 小时');
    expect(formatPlayTime(est(2 * 60 * 60_000))).toBe('2 小时');
  });
});

describe('computeWordCount / computeLastMessageAt（10.0 物化字段）', () => {
  it('字数=全部消息 content 非空白字符数之和', () => {
    const messages = [
      msg({ content: '雨夜 的旧\n书店' }),
      msg({ content: '  she said hi  ' }),
    ];
    expect(computeWordCount(messages)).toBe(6 + 9);
    expect(computeWordCount([])).toBe(0);
  });

  it('最后消息时间=全部时间戳取最大（容忍乱序），无时间戳为 undefined', () => {
    const t1 = new Date('2026-07-01T10:00:00').getTime();
    const t2 = new Date('2026-07-02T10:00:00').getTime();
    const messages = [msg({ timestamp: t2 }), msg({ timestamp: t1 })];
    expect(computeLastMessageAt(messages)).toBe(t2);
    expect(computeLastMessageAt([msg({})])).toBeUndefined();
  });

  it('rawData 的 gen_finished 优先于导入时 timestamp', () => {
    const messages = [msg({ timestamp: 1000, rawData: { gen_finished: '2026-07-03T08:00:00' } })];
    expect(computeLastMessageAt(messages)).toBe(new Date('2026-07-03T08:00:00').getTime());
  });

  it('computeStoryProps 一次算齐', () => {
    const props = computeStoryProps([msg({ content: 'abc', timestamp: 500 })]);
    expect(props).toEqual({ wordCount: 3, lastMessageAt: 500 });
  });
});
