import { describe, it, expect } from 'vitest';
import { parseRegex, formatRegex, applyRegexRules, getMessagePrefix, convertMessagesToTxt } from '@/lib/regex-processor';
import type { RegexRule, ChatMessage, ChapterMarker } from '@/types/chat';

describe('parseRegex', () => {
  it('should parse /pattern/flags format', () => {
    const regex = parseRegex('/hello/gi');
    expect(regex).not.toBeNull();
    expect(regex!.flags).toContain('g');
    expect(regex!.flags).toContain('i');
  });

  it('should auto-wrap plain pattern with /gs', () => {
    const regex = parseRegex('hello');
    expect(regex).not.toBeNull();
    expect(regex!.source).toBe('hello');
    expect(regex!.flags).toContain('g');
  });

  it('should return null for empty string', () => {
    expect(parseRegex('')).toBeNull();
  });

  it('should return null for invalid regex', () => {
    expect(parseRegex('/[invalid/g')).toBeNull();
  });
});

describe('formatRegex', () => {
  it('should keep /pattern/flags format as-is', () => {
    expect(formatRegex('/test/gi')).toBe('/test/gi');
  });

  it('should wrap plain pattern with /gs', () => {
    expect(formatRegex('hello world')).toBe('/hello world/gs');
  });

  it('should return empty string for empty input', () => {
    expect(formatRegex('')).toBe('');
  });
});

describe('applyRegexRules', () => {
  const makeRule = (overrides: Partial<RegexRule> = {}): RegexRule => ({
    id: 'test',
    name: 'Test Rule',
    findRegex: 'foo',
    replaceString: 'bar',
    placement: ['all'],
    disabled: false,
    ...overrides,
  });

  it('should apply simple replacement', () => {
    const result = applyRegexRules('hello foo world', [makeRule()], false);
    expect(result).toBe('hello bar world');
  });

  it('should skip disabled rules', () => {
    const result = applyRegexRules('hello foo', [makeRule({ disabled: true })], false);
    expect(result).toBe('hello foo');
  });

  it('should respect placement: user only', () => {
    const rule = makeRule({ placement: ['user'] });
    expect(applyRegexRules('foo', [rule], true)).toBe('bar');
    expect(applyRegexRules('foo', [rule], false)).toBe('foo');
  });

  it('should respect placement: assistant only', () => {
    const rule = makeRule({ placement: ['assistant'] });
    expect(applyRegexRules('foo', [rule], false)).toBe('bar');
    expect(applyRegexRules('foo', [rule], true)).toBe('foo');
  });

  it('should apply multiple rules in order', () => {
    const rules = [
      makeRule({ id: '1', findRegex: 'a', replaceString: 'b' }),
      makeRule({ id: '2', findRegex: 'b', replaceString: 'c' }),
    ];
    expect(applyRegexRules('a', rules, false)).toBe('c');
  });

  it('should handle complex regex patterns', () => {
    const rule = makeRule({
      findRegex: '<think(ing)?>[\\s\\S]*?</think(ing)?>',
      replaceString: '',
    });
    const content = 'Hello <thinking>some thoughts</thinking> World';
    expect(applyRegexRules(content, [rule], false)).toBe('Hello  World');
  });

  it('should handle special characters in content', () => {
    const rule = makeRule({ findRegex: '\\$', replaceString: 'dollar' });
    expect(applyRegexRules('price: $100', [rule], false)).toBe('price: dollar100');
  });

  it('should handle empty content', () => {
    expect(applyRegexRules('', [makeRule()], false)).toBe('');
  });

  it('should handle empty rules array', () => {
    expect(applyRegexRules('hello', [], false)).toBe('hello');
  });
});

describe('getMessagePrefix', () => {
  const userMsg: ChatMessage = { id: '1', role: 'user', content: 'hi', name: 'Alice' };
  const charMsg: ChatMessage = { id: '2', role: 'assistant', content: 'hello', name: 'Bob' };

  it('should return name in name mode', () => {
    expect(getMessagePrefix(userMsg, 'name')).toBe('Alice');
    expect(getMessagePrefix(charMsg, 'name')).toBe('Bob');
  });

  it('should return Human/Assistant in human-assistant mode', () => {
    expect(getMessagePrefix(userMsg, 'human-assistant')).toBe('Human');
    expect(getMessagePrefix(charMsg, 'human-assistant')).toBe('Assistant');
  });

  it('should return user/model in user-model mode', () => {
    expect(getMessagePrefix(userMsg, 'user-model')).toBe('user');
    expect(getMessagePrefix(charMsg, 'user-model')).toBe('model');
  });

  it('should return empty in none mode', () => {
    expect(getMessagePrefix(userMsg, 'none')).toBe('');
  });

  it('should fallback when name is missing', () => {
    const msg: ChatMessage = { id: '1', role: 'user', content: 'hi' };
    expect(getMessagePrefix(msg, 'name')).toBe('User');
  });
});

describe('convertMessagesToTxt', () => {
  const messages: ChatMessage[] = [
    { id: '1', role: 'user', content: 'Hello', name: 'Alice' },
    { id: '2', role: 'assistant', content: 'Hi there', name: 'Bob' },
    { id: '3', role: 'user', content: 'How are you?', name: 'Alice' },
  ];

  it('should convert messages to txt with name prefix', () => {
    const result = convertMessagesToTxt(messages, [], 'name');
    expect(result).toContain('Alice: Hello');
    expect(result).toContain('Bob: Hi there');
  });

  it('should skip empty messages after regex', () => {
    const rules: RegexRule[] = [{
      id: 'r1', name: 'Remove all', findRegex: '.*', replaceString: '',
      placement: ['user'], disabled: false,
    }];
    const result = convertMessagesToTxt(messages, rules, 'name');
    expect(result).not.toContain('Alice');
    expect(result).toContain('Bob: Hi there');
  });

  it('should include chapter markers', () => {
    const markers: ChapterMarker[] = [{
      messageId: '2', messageIndex: 1, title: 'Chapter 1', createdAt: Date.now(),
    }];
    const result = convertMessagesToTxt(messages, [], 'name', markers);
    expect(result).toContain('#### Chapter 1');
  });

  it('should include volume in markers', () => {
    const markers: ChapterMarker[] = [{
      messageId: '1', messageIndex: 0, title: 'Ch1', volume: 'Volume I',
      summary: 'Summary text', createdAt: Date.now(),
    }];
    const result = convertMessagesToTxt(messages, [], 'name', markers);
    expect(result).toContain('### Volume I');
    expect(result).toContain('> Summary text');
  });

  it('should handle none prefix mode', () => {
    const result = convertMessagesToTxt(messages, [], 'none');
    expect(result).not.toContain('Alice:');
    expect(result).toContain('Hello');
  });
});
