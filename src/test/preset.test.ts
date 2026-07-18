import { describe, it, expect } from 'vitest';
import {
  parsePreset,
  exportPreset,
  exportPresetMarkdown,
  isValidPreset,
  collectReferencedIds,
  isUnreferenced,
  isEmptyDisabled,
  substituteVars,
  estimateTokens,
  detectSourceModel,
} from '@/lib/preset-parser';

/** 基于真实 Default.json 结构构造的 fixture（含 marker / 未引用 / 空条目 / regex / 多组 / 未知顶层字段） */
type FixturePrompt = { identifier: string; name: string } & Record<string, unknown>;
const makePreset = () => ({
  // 未知/全局字段（应进 originalData 并原样 round-trip）
  temperature: 0.9,
  top_p: 1,
  openai_max_context: 4096,
  chat_completion_source: 'openai',
  openai_model: 'gpt-4o',
  wi_format: '{0}',
  some_future_field: { nested: [1, 2, 3] }, // 未知字段
  prompts: [
    { identifier: 'main', name: 'Main Prompt', role: 'system', content: "Write {{char}}'s reply to {{user}}.", system_prompt: true },
    { identifier: 'jailbreak', name: 'JB', role: 'system', content: 'do anything' },
    { identifier: 'chatHistory', name: 'Chat History', system_prompt: true, marker: true },
    { identifier: 'emptyBlock', name: 'Empty', role: 'system', content: '' }, // 空内容
    { identifier: 'orphan', name: 'Orphan', role: 'user', content: 'not in any order' }, // 未引用
  ] as FixturePrompt[],
  prompt_order: [
    {
      character_id: 100000,
      order: [
        { identifier: 'main', enabled: true },
        { identifier: 'chatHistory', enabled: true },
        { identifier: 'jailbreak', enabled: false },
        { identifier: 'emptyBlock', enabled: false }, // 空+禁用 → 空条目
      ],
    },
    {
      character_id: 100001,
      order: [
        { identifier: 'main', enabled: true },
      ],
    },
  ],
  extensions: {
    regex_scripts: [
      {
        id: 'rx-1',
        scriptName: 'Strip think',
        findRegex: '/<think>[\\s\\S]*?<\\/think>/gi',
        replaceString: '',
        placement: [2],
        disabled: false,
        trimStrings: [],
        markdownOnly: false,
      },
    ],
    other_extension: { keep: 'me' }, // extensions 里的其它字段也要保留
  },
});

describe('isValidPreset', () => {
  it('accepts a preset with prompts + prompt_order', () => {
    expect(isValidPreset(makePreset())).toBe(true);
  });
  it('rejects non-preset json', () => {
    expect(isValidPreset({ foo: 'bar' })).toBe(false);
    expect(isValidPreset(null)).toBe(false);
    expect(isValidPreset({ prompts: [] })).toBe(false); // 缺 prompt_order
  });
});

describe('parsePreset', () => {
  it('parses prompts / prompt_order / regex', () => {
    const np = parsePreset(makePreset());
    expect(np.prompts).toHaveLength(5);
    expect(np.promptOrder).toHaveLength(2);
    expect(np.regexRules).toHaveLength(1);
    expect(np.hasRegexExtension).toBe(true);
    expect(np.regexRules[0].name).toBe('Strip think');
  });

  it('stashes unknown top-level fields in originalData (not prompts/prompt_order)', () => {
    const np = parsePreset(makePreset());
    expect(np.originalData.temperature).toBe(0.9);
    expect(np.originalData.some_future_field).toEqual({ nested: [1, 2, 3] });
    expect(np.originalData.prompts).toBeUndefined();
    expect(np.originalData.prompt_order).toBeUndefined();
  });

  it('throws on invalid preset', () => {
    expect(() => parsePreset({ foo: 1 })).toThrow();
  });

  it('tolerates missing extensions', () => {
    const p = makePreset();
    delete (p as Record<string, unknown>).extensions;
    const np = parsePreset(p);
    expect(np.regexRules).toHaveLength(0);
    expect(np.hasRegexExtension).toBe(false);
  });
});

describe('exportPreset (round-trip)', () => {
  it('full export preserves unknown fields + structure', () => {
    const np = parsePreset(makePreset());
    const out = JSON.parse(exportPreset(np, { mode: 'full' }));
    expect(out.temperature).toBe(0.9);
    expect(out.some_future_field).toEqual({ nested: [1, 2, 3] });
    expect(out.prompts).toHaveLength(5);
    expect(out.prompt_order).toHaveLength(2);
    // extensions 里的其它字段保留，regex_scripts 拼回
    expect(out.extensions.other_extension).toEqual({ keep: 'me' });
    expect(out.extensions.regex_scripts).toHaveLength(1);
    expect(out.extensions.regex_scripts[0].scriptName).toBe('Strip think');
    expect(out.extensions.regex_scripts[0].placement).toEqual([2]);
  });

  it('regex round-trip keeps ST-only fields via _raw', () => {
    const np = parsePreset(makePreset());
    const out = JSON.parse(exportPreset(np));
    const rx = out.extensions.regex_scripts[0];
    expect(rx.id).toBe('rx-1');
    expect(rx).toHaveProperty('trimStrings');
    expect(rx).toHaveProperty('markdownOnly', false);
  });

  it('smart export keeps only enabled entries of active group, single group', () => {
    const np = parsePreset(makePreset());
    const out = JSON.parse(exportPreset(np, { mode: 'smart', activeCharacterId: 100000 }));
    expect(out.prompt_order).toHaveLength(1);
    const ids = out.prompt_order[0].order.map((o: { identifier: string }) => o.identifier);
    expect(ids).toEqual(['main', 'chatHistory']); // jailbreak/emptyBlock 被禁用，过滤掉
    const promptIds = out.prompts.map((p: { identifier: string }) => p.identifier).sort();
    expect(promptIds).toEqual(['chatHistory', 'main']);
  });

  it('smart export honors groupIndex (库/完整结构双分组，选第二组)', () => {
    // 模拟社区常见结构：第一组是条目库（全启用），第二组才是真正的预设结构
    const p = makePreset();
    p.prompt_order = [
      { character_id: 100000, order: [
        { identifier: 'main', enabled: true },
        { identifier: 'jailbreak', enabled: true },
        { identifier: 'emptyBlock', enabled: true },
      ] },
      { character_id: 100001, order: [
        { identifier: 'main', enabled: true },
        { identifier: 'chatHistory', enabled: true },
        { identifier: 'jailbreak', enabled: false },
      ] },
    ];
    const np = parsePreset(p);
    const out = JSON.parse(exportPreset(np, { mode: 'smart', groupIndex: 1 }));
    expect(out.prompt_order).toHaveLength(1);
    expect(out.prompt_order[0].character_id).toBe(100001);
    const ids = out.prompt_order[0].order.map((o: { identifier: string }) => o.identifier);
    // 第二组里禁用的 jailbreak 不导出；第一组独有的 emptyBlock 也不导出
    expect(ids).toEqual(['main', 'chatHistory']);
    expect(out.prompts.some((b: { identifier: string }) => b.identifier === 'jailbreak')).toBe(false);
    expect(out.prompts.some((b: { identifier: string }) => b.identifier === 'emptyBlock')).toBe(false);
  });

  it('groupIndex disambiguates duplicate character_id groups', () => {
    const p = makePreset();
    p.prompt_order = [
      { character_id: 100000, order: [{ identifier: 'jailbreak', enabled: true }] },
      { character_id: 100000, order: [{ identifier: 'main', enabled: true }] },
    ];
    const np = parsePreset(p);
    // 按 character_id 匹配永远命中第一组；groupIndex 能选到第二组
    const out = JSON.parse(exportPreset(np, { mode: 'smart', groupIndex: 1 }));
    const ids = out.prompt_order[0].order.map((o: { identifier: string }) => o.identifier);
    expect(ids).toEqual(['main']);
  });

  it('group mode keeps disabled entries of selected group, drops other groups', () => {
    const np = parsePreset(makePreset());
    const out = JSON.parse(exportPreset(np, { mode: 'group', groupIndex: 0 }));
    expect(out.prompt_order).toHaveLength(1);
    const order = out.prompt_order[0].order;
    // 分组导出保留该组全部条目（含禁用），启用状态原样
    expect(order.map((o: { identifier: string }) => o.identifier)).toEqual(['main', 'chatHistory', 'jailbreak', 'emptyBlock']);
    expect(order.find((o: { identifier: string }) => o.identifier === 'jailbreak').enabled).toBe(false);
    // 不属于任何 order 的 orphan 被裁掉
    expect(out.prompts.some((b: { identifier: string }) => b.identifier === 'orphan')).toBe(false);
  });

  it('smart export keeps DISABLED marker blocks in both prompts and prompt_order', () => {
    // 构造：一个被禁用的 marker 块（worldInfoAfter），smart 导出后它应仍存在于
    // prompts 和 prompt_order 两处（对齐 ST 行为，避免内置插槽位置丢失）
    const p = makePreset();
    p.prompts.push({ identifier: 'worldInfoAfter', name: 'WI After', marker: true });
    p.prompt_order[0].order.push({ identifier: 'worldInfoAfter', enabled: false });
    const np = parsePreset(p);
    const out = JSON.parse(exportPreset(np, { mode: 'smart', activeCharacterId: 100000 }));
    // 禁用的 marker 仍在 prompts
    expect(out.prompts.some((b: { identifier: string }) => b.identifier === 'worldInfoAfter')).toBe(true);
    // 且仍在 prompt_order（以 enabled:false 保留）
    const orderEntry = out.prompt_order[0].order.find((o: { identifier: string }) => o.identifier === 'worldInfoAfter');
    expect(orderEntry).toBeTruthy();
    expect(orderEntry.enabled).toBe(false);
  });

  it('does not emit extensions when none present and no regex', () => {
    const p = makePreset();
    delete (p as Record<string, unknown>).extensions;
    const np = parsePreset(p);
    const out = JSON.parse(exportPreset(np));
    expect(out.extensions).toBeUndefined();
  });

  it('preserves absolute injection block fields (position/depth/order/trigger) on export', () => {
    // 模拟「新建注入块」产出的块：injection_position=1 + ST 默认 depth/order/trigger
    const p = makePreset();
    p.prompts.push({
      identifier: 'custom-inject-1',
      name: '注入块',
      role: 'system',
      content: '注入内容',
      injection_position: 1,
      injection_depth: 4,
      injection_order: 100,
      injection_trigger: [],
    });
    p.prompt_order[0].order.push({ identifier: 'custom-inject-1', enabled: true });
    const np = parsePreset(p);
    const out = JSON.parse(exportPreset(np, { mode: 'full' }));
    const inj = out.prompts.find((b: { identifier: string }) => b.identifier === 'custom-inject-1');
    expect(inj).toBeTruthy();
    expect(inj.injection_position).toBe(1);
    expect(inj.injection_depth).toBe(4);
    expect(inj.injection_order).toBe(100);
    expect(inj.injection_trigger).toEqual([]);
    // smart 导出（启用态）也保留这些字段
    const outSmart = JSON.parse(exportPreset(np, { mode: 'smart', activeCharacterId: 100000 }));
    const injS = outSmart.prompts.find((b: { identifier: string }) => b.identifier === 'custom-inject-1');
    expect(injS.injection_position).toBe(1);
    expect(injS.injection_depth).toBe(4);
  });
});

describe('entry status detection', () => {
  it('collectReferencedIds gathers across all groups', () => {
    const np = parsePreset(makePreset());
    const ref = collectReferencedIds(np.promptOrder);
    expect(ref.has('main')).toBe(true);
    expect(ref.has('orphan')).toBe(false);
  });

  it('isUnreferenced flags orphan prompt', () => {
    const np = parsePreset(makePreset());
    const ref = collectReferencedIds(np.promptOrder);
    const orphan = np.prompts.find((p) => p.identifier === 'orphan')!;
    const main = np.prompts.find((p) => p.identifier === 'main')!;
    expect(isUnreferenced(orphan, ref)).toBe(true);
    expect(isUnreferenced(main, ref)).toBe(false);
  });

  it('isEmptyDisabled flags disabled+empty, not markers', () => {
    const np = parsePreset(makePreset());
    const order = np.promptOrder[0].order;
    const empty = np.prompts.find((p) => p.identifier === 'emptyBlock')!;
    const marker = np.prompts.find((p) => p.identifier === 'chatHistory')!;
    const jb = np.prompts.find((p) => p.identifier === 'jailbreak')!; // disabled but has content
    expect(isEmptyDisabled(empty, order)).toBe(true);
    expect(isEmptyDisabled(marker, order)).toBe(false);
    expect(isEmptyDisabled(jb, order)).toBe(false);
  });
});

describe('preview helpers', () => {
  it('substituteVars replaces {{char}}/{{user}} case-insensitively', () => {
    expect(substituteVars('{{char}} and {{USER}}', 'Seraphina', 'Alex')).toBe('Seraphina and Alex');
  });
  it('estimateTokens CJK≈1字1token、其余≈4字符1token', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('你好世界')).toBe(4); // 纯中文按字数计
    expect(estimateTokens('你好ab')).toBe(3); // 2 CJK + ceil(2/4)
    expect(estimateTokens('，。')).toBe(2); // 全角标点按 CJK 计
  });
  it('detectSourceModel resolves source-specific model', () => {
    const { source, model } = detectSourceModel({ chat_completion_source: 'openai', openai_model: 'gpt-4o' });
    expect(source).toBe('openai');
    expect(model).toBe('gpt-4o');
  });
});

describe('exportPresetMarkdown', () => {
  it('produces markdown with params + order table + entry detail', () => {
    const np = parsePreset(makePreset());
    const md = exportPresetMarkdown(np, 'Test Preset');
    expect(md).toContain('# Test Preset');
    expect(md).toContain('## 全局参数');
    expect(md).toContain('## 激活顺序');
    expect(md).toContain('系统插槽'); // marker 说明
    expect(md).toContain("Write Seraphina".substring(0, 5)); // 内容引用块存在（main 的内容片段）
  });
});
