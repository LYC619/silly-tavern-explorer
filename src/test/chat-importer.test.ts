import { describe, it, expect } from 'vitest';
import { isTrueSystemMessage } from '@/components/ChatImporter';

// Test the JSONL parsing logic directly
function parseJsonl(content: string) {
  const lines = content.trim().split('\n');
  const messages: Record<string, unknown>[] = [];
  let metadata: Record<string, unknown> | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (i === 0 && ('user_name' in parsed || 'character_name' in parsed || 'chat_metadata' in parsed)) {
        metadata = parsed;
        continue;
      }
      if (parsed.is_system) continue;
      const messageContent = parsed.mes || parsed.content || parsed.message || '';
      if (!messageContent) continue;
      messages.push({
        role: parsed.is_user ? 'user' : 'assistant',
        content: messageContent,
        name: parsed.name || (parsed.is_user ? 'User' : 'Character'),
      });
    } catch {
      // skip invalid lines
    }
  }
  return { messages, metadata };
}

describe('JSONL Parser', () => {
  it('should parse standard SillyTavern JSONL', () => {
    const content = [
      JSON.stringify({ user_name: 'Alice', character_name: 'Bob', chat_metadata: {} }),
      JSON.stringify({ name: 'Alice', is_user: true, mes: 'Hello' }),
      JSON.stringify({ name: 'Bob', is_user: false, mes: 'Hi there' }),
    ].join('\n');

    const { messages, metadata } = parseJsonl(content);
    expect(metadata.user_name).toBe('Alice');
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].content).toBe('Hi there');
  });

  it('should skip system messages', () => {
    const content = [
      JSON.stringify({ user_name: 'A', character_name: 'B' }),
      JSON.stringify({ is_system: true, mes: 'System message' }),
      JSON.stringify({ name: 'A', is_user: true, mes: 'Hello' }),
    ].join('\n');

    const { messages } = parseJsonl(content);
    expect(messages).toHaveLength(1);
  });

  it('should skip empty messages', () => {
    const content = [
      JSON.stringify({ user_name: 'A', character_name: 'B' }),
      JSON.stringify({ name: 'A', is_user: true, mes: '' }),
      JSON.stringify({ name: 'B', is_user: false, mes: 'Valid' }),
    ].join('\n');

    const { messages } = parseJsonl(content);
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('Valid');
  });

  it('should handle malformed lines gracefully', () => {
    const content = [
      JSON.stringify({ user_name: 'A', character_name: 'B' }),
      'this is not json',
      JSON.stringify({ name: 'A', is_user: true, mes: 'Hello' }),
    ].join('\n');

    const { messages } = parseJsonl(content);
    expect(messages).toHaveLength(1);
  });

  it('should handle empty input', () => {
    const { messages, metadata } = parseJsonl('');
    expect(messages).toHaveLength(0);
    expect(metadata).toBeUndefined();
  });

  it('should handle content/message field alternatives', () => {
    const content = [
      JSON.stringify({ user_name: 'A', character_name: 'B' }),
      JSON.stringify({ name: 'A', is_user: true, content: 'Via content field' }),
      JSON.stringify({ name: 'B', is_user: false, message: 'Via message field' }),
    ].join('\n');

    const { messages } = parseJsonl(content);
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('Via content field');
    expect(messages[1].content).toBe('Via message field');
  });

  it('should handle special characters in messages', () => {
    const content = [
      JSON.stringify({ user_name: 'A', character_name: 'B' }),
      JSON.stringify({ name: 'A', is_user: true, mes: 'Hello "world" & <tag>' }),
    ].join('\n');

    const { messages } = parseJsonl(content);
    expect(messages[0].content).toBe('Hello "world" & <tag>');
  });

  it('should handle very long messages', () => {
    const longText = 'x'.repeat(100000);
    const content = [
      JSON.stringify({ user_name: 'A', character_name: 'B' }),
      JSON.stringify({ name: 'A', is_user: true, mes: longText }),
    ].join('\n');

    const { messages } = parseJsonl(content);
    expect((messages[0].content as string).length).toBe(100000);
  });
});

describe('isTrueSystemMessage (Hide vs 真系统提示)', () => {
  it('被 Hide 的真实开场白（有 name+mes+is_user）不是真系统 → 应导入', () => {
    // ST 的 Hide 把 is_system 置 true，但这是一条 785 字的角色开场白
    expect(isTrueSystemMessage({
      name: 'Seraphina', is_user: false, mes: '很长的开场白……',
    })).toBe(false);
  });

  it('空 mes 的注入是真系统 → 应跳过', () => {
    expect(isTrueSystemMessage({ name: 'System', is_user: false, mes: '' })).toBe(true);
  });

  it('既无 name 又无 is_user 的纯注入是真系统', () => {
    expect(isTrueSystemMessage({ mes: '一些系统注入文本' })).toBe(true);
  });

  it('extra.type = narrator / system 是真系统（/sys、/comment）', () => {
    expect(isTrueSystemMessage({ name: 'X', is_user: false, mes: 'x', extra: { type: 'narrator' } })).toBe(true);
    expect(isTrueSystemMessage({ name: 'X', is_user: false, mes: 'x', extra: { type: 'system' } })).toBe(true);
  });

  it('用户楼层被 Hide（is_user:true + 有 mes）不是真系统 → 应导入', () => {
    expect(isTrueSystemMessage({ name: '我', is_user: true, mes: '一条被隐藏的用户发言' })).toBe(false);
  });
});
