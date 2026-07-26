import { describe, it, expect } from 'vitest';
import { guessFileType } from '@/lib/file-type-guess';

describe('guessFileType 扩展名', () => {
  it('png → 角色卡；jsonl/txt → 聊天；未知扩展名 → null', () => {
    expect(guessFileType('hermione.PNG')).toBe('card');
    expect(guessFileType('chat.jsonl')).toBe('chat');
    expect(guessFileType('novel.txt')).toBe('chat');
    expect(guessFileType('readme.md')).toBeNull();
  });

  it('.json 无内容时拿不准 → null', () => {
    expect(guessFileType('data.json')).toBeNull();
  });
});

describe('guessFileType .json 内容嗅探', () => {
  it('V2/V3 角色卡（spec 标记）与 V1 卡（name+first_mes）', () => {
    expect(guessFileType('c.json', JSON.stringify({ spec: 'chara_card_v2', data: {} }))).toBe('card');
    expect(guessFileType('c.json', JSON.stringify({ spec: 'chara_card_v3', data: {} }))).toBe('card');
    expect(guessFileType('c.json', JSON.stringify({ name: '赫敏', first_mes: '你好' }))).toBe('card');
  });

  it('世界书（entries 映射）', () => {
    const wb = { entries: { '0': { uid: 0, key: ['魔法'], content: '设定' } } };
    expect(guessFileType('wb.json', JSON.stringify(wb))).toBe('worldbook');
  });

  it('正则：单条脚本与脚本数组', () => {
    const script = { scriptName: '去OOC', findRegex: '/ooc/g', replaceString: '' };
    expect(guessFileType('r.json', JSON.stringify(script))).toBe('regex');
    expect(guessFileType('r.json', JSON.stringify([script, script]))).toBe('regex');
  });

  it('预设：prompts / prompt_order / 采样参数指纹', () => {
    expect(guessFileType('p.json', JSON.stringify({ prompts: [] }))).toBe('preset');
    expect(guessFileType('p.json', JSON.stringify({ prompt_order: [] }))).toBe('preset');
    expect(guessFileType('p.json', JSON.stringify({ temperature: 1, openai_max_context: 8192 }))).toBe('preset');
  });

  it('聊天：消息数组（ST mes 字段）与伪装成 .json 的 JSONL', () => {
    const msgs = [{ name: 'A', is_user: false, send_date: 1, mes: 'hi' }];
    expect(guessFileType('chat.json', JSON.stringify(msgs))).toBe('chat');
    const jsonl = '{"user_name":"U","character_name":"C"}\n{"name":"C","is_user":false,"send_date":1,"mes":"hi"}';
    expect(guessFileType('chat.json', jsonl)).toBe('chat');
  });

  it('拿不准的对象/坏 JSON → null（交给用户选）', () => {
    expect(guessFileType('x.json', JSON.stringify({ foo: 1 }))).toBeNull();
    expect(guessFileType('x.json', '{ bad')).toBeNull();
    expect(guessFileType('x.json', '[]')).toBeNull();
  });
});
