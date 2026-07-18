import { describe, it, expect } from 'vitest';
import { scanTxtSpeakers, parseTxtDialogue } from '@/lib/txt-import';

const SAMPLE = [
  'Seraphina: *You wake with a start...*',
  '独孤寸: 一年后，我们相恋了（使用中文回复）',
].join('\n');

describe('scanTxtSpeakers', () => {
  it('按出现顺序提取全部说话人', () => {
    expect(scanTxtSpeakers(SAMPLE)).toEqual(['Seraphina', '独孤寸']);
  });

  it('排除属性行（全小写/下划线）与无冒号行', () => {
    const content = [
      'Alice: hi',
      'mood: happy',
      '纯叙述没有冒号',
      'Bob: hello',
      'Alice: again',
    ].join('\n');
    expect(scanTxtSpeakers(content)).toEqual(['Alice', 'Bob']);
  });

  it('没有说话人时返回空数组', () => {
    expect(scanTxtSpeakers('只是一段没有对话的文字\n第二段')).toEqual([]);
  });
});

describe('parseTxtDialogue 用户选择', () => {
  it('选择「独孤寸」为用户：Seraphina 为 assistant、独孤寸为 user，姓名均保留', () => {
    const messages = parseTxtDialogue(SAMPLE, '独孤寸');
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('assistant');
    expect(messages[0].name).toBe('Seraphina');
    expect(messages[0].content).toBe('*You wake with a start...*');
    expect(messages[1].role).toBe('user');
    expect(messages[1].name).toBe('独孤寸');
    expect(messages[1].content).toBe('一年后，我们相恋了（使用中文回复）');
  });

  it('解析使用当前选择值而非初始 User：换选 Seraphina 后角色对调', () => {
    const messages = parseTxtDialogue(SAMPLE, 'Seraphina');
    expect(messages[0].role).toBe('user');
    expect(messages[0].name).toBe('Seraphina');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].name).toBe('独孤寸');
  });

  it('未指定用户名时按默认 User 匹配（兜底）', () => {
    const messages = parseTxtDialogue('User: hi\nBot: hello');
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
  });

  it('多个非用户说话人都归为 assistant，但各自姓名保留', () => {
    const content = [
      'Alice: 大家好',
      'Bob: 你好 Alice',
      'Carol: 我也在',
      'Alice: 开始吧',
    ].join('\n');
    const messages = parseTxtDialogue(content, 'Alice');
    expect(messages.map(m => m.role)).toEqual(['user', 'assistant', 'assistant', 'user']);
    expect(messages.map(m => m.name)).toEqual(['Alice', 'Bob', 'Carol', 'Alice']);
  });

  it('属性行并入上一条消息，无冒号行并入或成为 Narrator', () => {
    const content = [
      'Alice: hi',
      'mood: happy',
    ].join('\n');
    const messages = parseTxtDialogue(content, 'Alice');
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('hi\nmood: happy');

    const narration = parseTxtDialogue('开场纯叙述\nAlice: hi', 'Alice');
    expect(narration[0].name).toBe('Narrator');
    expect(narration[0].role).toBe('assistant');
  });
});
