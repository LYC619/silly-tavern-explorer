import { describe, it, expect } from 'vitest';
import { extractMiniSummaries, miniSummariesToText } from '@/lib/mini-summary';
import type { ChatSession } from '@/types/chat';

function session(msgs: { role: 'user' | 'assistant'; content: string }[]): ChatSession {
  return {
    id: 's', title: 't', character: { name: 'AI' }, user: { name: '我' }, createdAt: 0,
    messages: msgs.map((m, i) => ({ id: String(i), role: m.role, content: m.content, is_user: m.role === 'user' })),
  };
}

describe('extractMiniSummaries', () => {
  it('用捕获组提取小结并与前一条用户消息配对', () => {
    const s = session([
      { role: 'user', content: '我们去森林吧' },
      { role: 'assistant', content: '好的，出发了。<summary>去了森林</summary>' },
      { role: 'user', content: '看到了什么' },
      { role: 'assistant', content: '一头鹿。<summary>遇见鹿</summary>' },
    ]);
    const pairs = extractMiniSummaries(s, '/<summary>([\\s\\S]*?)<\\/summary>/g');
    expect(pairs).toHaveLength(2);
    expect(pairs[0]).toEqual({ floor: 1, userText: '我们去森林吧', summary: '去了森林' });
    expect(pairs[1]).toEqual({ floor: 3, userText: '看到了什么', summary: '遇见鹿' });
  });

  it('无捕获组时取整段匹配', () => {
    const s = session([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: '正文……【小结：平安无事】' },
    ]);
    const pairs = extractMiniSummaries(s, '/【小结：.*?】/');
    expect(pairs[0].summary).toBe('【小结：平安无事】');
  });

  it('没有小结的 AI 楼层跳过', () => {
    const s = session([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: '没有小结的普通回复' },
    ]);
    expect(extractMiniSummaries(s, '/<summary>(.*?)<\\/summary>/')).toEqual([]);
  });

  it('非法正则返回空', () => {
    const s = session([{ role: 'assistant', content: 'x' }]);
    expect(extractMiniSummaries(s, 'not-a-regex')).toEqual([]);
  });

  it('无前置用户消息时 userText 为空', () => {
    const s = session([
      { role: 'assistant', content: '开场<summary>序幕</summary>' },
    ]);
    const pairs = extractMiniSummaries(s, '/<summary>(.*?)<\\/summary>/');
    expect(pairs[0].userText).toBe('');
    expect(pairs[0].summary).toBe('序幕');
  });
});

describe('miniSummariesToText', () => {
  it('渲染配对为文本', () => {
    const text = miniSummariesToText([
      { floor: 1, userText: '去森林', summary: '去了森林' },
      { floor: 3, userText: '', summary: '遇见鹿' },
    ]);
    expect(text).toContain('【用户】去森林');
    expect(text).toContain('【小结 #1】去了森林');
    expect(text).toContain('【小结 #3】遇见鹿');
    expect(text).not.toContain('【用户】\n【小结 #3】'); // 空 userText 不输出
  });
});
