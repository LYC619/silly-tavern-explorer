import { describe, it, expect } from 'vitest';

// Test the JSONL parsing logic directly
function parseJsonl(content: string) {
  const lines = content.trim().split('\n');
  const messages: any[] = [];
  let metadata: any;

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
    expect(messages[0].content.length).toBe(100000);
  });
});
