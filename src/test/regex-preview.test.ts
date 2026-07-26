import { describe, it, expect } from 'vitest';
import { previewRegexRules, diffParts } from '@/lib/regex-preview';
import type { RegexRule } from '@/types/chat';

const rule = (over: Partial<RegexRule>): RegexRule => ({
  id: 'r1',
  name: '规则',
  findRegex: '/foo/g',
  replaceString: 'bar',
  placement: ['all'],
  disabled: false,
  ...over,
});

describe('previewRegexRules 逐条生效预览', () => {
  it('命中规则标 matched，记录前后文本；final 为串行结果', () => {
    const r = previewRegexRules('say foo now', [rule({})]);
    expect(r.final).toBe('say bar now');
    expect(r.effects[0]).toMatchObject({ applied: true, matched: true, before: 'say foo now', after: 'say bar now' });
    expect(r.matchedCount).toBe(1);
  });

  it('未命中的规则 matched=false，文本原样传给下一条', () => {
    const r = previewRegexRules('hello', [rule({ id: 'a', findRegex: '/xyz/g' }), rule({ id: 'b', findRegex: '/hel/g', replaceString: 'HEL' })]);
    expect(r.effects[0].matched).toBe(false);
    expect(r.effects[1]).toMatchObject({ matched: true, after: 'HELlo' });
    expect(r.final).toBe('HELlo');
  });

  it('禁用规则不参与（disabled 标记）', () => {
    const r = previewRegexRules('foo', [rule({ disabled: true })]);
    expect(r.effects[0]).toMatchObject({ disabled: true, applied: false, matched: false });
    expect(r.final).toBe('foo');
  });

  it('placement 不匹配当前楼类型时不应用', () => {
    const userOnly = rule({ placement: ['user'] });
    const asAI = previewRegexRules('foo', [userOnly], false);
    expect(asAI.effects[0].applied).toBe(false);
    const asUser = previewRegexRules('foo', [userOnly], true);
    expect(asUser.effects[0]).toMatchObject({ applied: true, matched: true });
  });

  it('写错的正则标 invalid，参与但不改文本', () => {
    const r = previewRegexRules('foo', [rule({ findRegex: '/[bad/g' })]);
    expect(r.effects[0]).toMatchObject({ applied: true, invalid: true, matched: false });
    expect(r.final).toBe('foo');
  });

  it('串行语义：前一条的输出是后一条的输入', () => {
    const r = previewRegexRules('abc', [
      rule({ id: 'a', findRegex: '/abc/g', replaceString: 'xyz' }),
      rule({ id: 'b', findRegex: '/xyz/g', replaceString: 'ok' }),
    ]);
    expect(r.effects[1].before).toBe('xyz');
    expect(r.final).toBe('ok');
  });
});

describe('diffParts 差异切分', () => {
  it('公共前后缀裁剪出改动段', () => {
    expect(diffParts('say foo now', 'say bar now')).toEqual({
      prefix: 'say ',
      removed: 'foo',
      added: 'bar',
      suffix: ' now',
    });
  });

  it('纯删除与纯插入', () => {
    expect(diffParts('a<b>c', 'ac')).toMatchObject({ removed: '<b>', added: '' });
    expect(diffParts('ac', 'a+c')).toMatchObject({ removed: '', added: '+' });
  });

  it('完全相同时改动段为空', () => {
    const d = diffParts('same', 'same');
    expect(d.removed).toBe('');
    expect(d.added).toBe('');
  });
});
