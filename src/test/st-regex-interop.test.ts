import { describe, it, expect } from 'vitest';
import {
  stScriptToRule,
  ruleToSTScript,
  parseSTRegexImport,
  exportSTRegex,
  ST_PLACEMENT,
  type STRegexScript,
} from '@/lib/st-regex-interop';
import type { RegexRule } from '@/types/chat';

const makeST = (over: Partial<STRegexScript> = {}): STRegexScript => ({
  id: 'st-1',
  scriptName: 'Strip think',
  findRegex: '/<think>[\\s\\S]*?<\\/think>/gi',
  replaceString: '',
  placement: [ST_PLACEMENT.AI_OUTPUT],
  disabled: false,
  ...over,
});

describe('stScriptToRule', () => {
  it('maps core fields', () => {
    const r = stScriptToRule(makeST());
    expect(r.id).toBe('st-1');
    expect(r.name).toBe('Strip think');
    expect(r.findRegex).toContain('think');
    expect(r.disabled).toBe(false);
  });

  it('maps placement [2] (AI) → ["assistant"]', () => {
    expect(stScriptToRule(makeST({ placement: [2] })).placement).toEqual(['assistant']);
  });
  it('maps placement [1] (user) → ["user"]', () => {
    expect(stScriptToRule(makeST({ placement: [1] })).placement).toEqual(['user']);
  });
  it('maps placement [1,2] → ["all"]', () => {
    expect(stScriptToRule(makeST({ placement: [1, 2] })).placement).toEqual(['all']);
  });
  it('maps WI/slash-only placement → ["all"] fallback', () => {
    expect(stScriptToRule(makeST({ placement: [3, 4] })).placement).toEqual(['all']);
  });

  it('stashes ST-only fields into _raw', () => {
    const r = stScriptToRule(makeST({ trimStrings: ['x'], substituteRegex: 2, markdownOnly: true }));
    expect(r._raw).toMatchObject({ trimStrings: ['x'], substituteRegex: 2, markdownOnly: true });
  });

  it('generates an id when ST script lacks one', () => {
    const r = stScriptToRule(makeST({ id: undefined }));
    expect(r.id).toBeTruthy();
  });
});

describe('ruleToSTScript (round-trip)', () => {
  it('restores ST-only fields from _raw', () => {
    const st = makeST({ trimStrings: ['a'], substituteRegex: 2, minDepth: 1, maxDepth: 5 });
    const back = ruleToSTScript(stScriptToRule(st));
    expect(back.trimStrings).toEqual(['a']);
    expect(back.substituteRegex).toBe(2);
    expect(back.minDepth).toBe(1);
    expect(back.maxDepth).toBe(5);
  });

  it('preserves id across round-trip (no duplicate-import on re-import)', () => {
    const back = ruleToSTScript(stScriptToRule(makeST({ id: 'keep-me' })));
    expect(back.id).toBe('keep-me');
  });

  it('round-trips placement [1] → user → [1]', () => {
    const back = ruleToSTScript(stScriptToRule(makeST({ placement: [1] })));
    expect(back.placement).toEqual([1]);
  });

  it('fills ST defaults for a rule created in-app (no _raw)', () => {
    const rule: RegexRule = {
      id: 'app-1', name: 'n', findRegex: '/x/g', replaceString: '', placement: ['assistant'], disabled: false,
    };
    const st = ruleToSTScript(rule);
    expect(st.runOnEdit).toBe(true);
    expect(st.substituteRegex).toBe(0);
    expect(st.trimStrings).toEqual([]);
    expect(st.placement).toEqual([2]);
  });
});

describe('parseSTRegexImport', () => {
  it('parses a single script object', () => {
    const rules = parseSTRegexImport(makeST());
    expect(rules).toHaveLength(1);
    expect(rules[0].name).toBe('Strip think');
  });
  it('parses a bare array', () => {
    const rules = parseSTRegexImport([makeST({ id: 'a' }), makeST({ id: 'b' })]);
    expect(rules.map(r => r.id)).toEqual(['a', 'b']);
  });
  it('parses a { scripts: [] } package', () => {
    const rules = parseSTRegexImport({ scripts: [makeST({ id: 'p1' })] });
    expect(rules[0].id).toBe('p1');
  });
  it('throws on unrecognized shape', () => {
    expect(() => parseSTRegexImport({ foo: 'bar' })).toThrow();
  });
});

describe('exportSTRegex', () => {
  it('exports a single rule as a bare object (ST single-script form)', () => {
    const rule = stScriptToRule(makeST());
    const out = JSON.parse(exportSTRegex([rule]));
    expect(Array.isArray(out)).toBe(false);
    expect(out.scriptName).toBe('Strip think');
  });
  it('exports multiple rules as an array', () => {
    const out = JSON.parse(exportSTRegex([stScriptToRule(makeST({ id: 'a' })), stScriptToRule(makeST({ id: 'b' }))]));
    expect(Array.isArray(out)).toBe(true);
    expect(out).toHaveLength(2);
  });
});
