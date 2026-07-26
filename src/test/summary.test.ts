import { describe, it, expect } from 'vitest';
import {
  generateSummaryId,
  generateSummaryTemplateId,
  SUMMARY_KIND_LABELS,
  type SummaryKind,
} from '@/types/summary';
import {
  BUILTIN_SUMMARY_TEMPLATES,
  getBuiltinTemplate,
  defaultTemplateIdForKind,
  templateMatchesKind,
  isBuiltinTemplate,
} from '@/lib/summary-templates';

describe('summary types', () => {
  it('generateSummaryId 产生 sum_ 前缀且互不相同', () => {
    const a = generateSummaryId();
    const b = generateSummaryId();
    expect(a).toMatch(/^sum_\d+_[a-z0-9]+$/);
    expect(a).not.toBe(b);
  });

  it('generateSummaryTemplateId 产生 stpl_ 前缀（与内置 builtin- 前缀区分）', () => {
    expect(generateSummaryTemplateId()).toMatch(/^stpl_\d+_[a-z0-9]+$/);
  });

  it('SUMMARY_KIND_LABELS 覆盖全部三种呈现', () => {
    expect(Object.keys(SUMMARY_KIND_LABELS).sort()).toEqual(['diary', 'diy', 'volume']);
  });
});

describe('builtin summary templates', () => {
  it('每种呈现类型都有默认内置模板，id 与 kind 一一对应', () => {
    // 三种呈现类型各有默认模板；diy 另有「小说化润色」内置（阶段6），故总数 ≥3
    expect(BUILTIN_SUMMARY_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    for (const kind of ['volume', 'diary', 'diy'] as SummaryKind[]) {
      const id = defaultTemplateIdForKind(kind);
      const t = getBuiltinTemplate(id);
      expect(t).toBeDefined();
      expect(t!.kind).toBe(kind);
      expect(isBuiltinTemplate(t!)).toBe(true);
      expect(t!.content.length).toBeGreaterThan(50);
    }
  });

  it('小说化润色内置模板存在，归入 diy 呈现', () => {
    const t = getBuiltinTemplate('builtin-novelize');
    expect(t).toBeDefined();
    expect(t!.kind).toBe('diy');
    expect(t!.content).toContain('小说');
  });

  it('分卷模板含 {{volume}} 宏与存档节点结构', () => {
    const t = getBuiltinTemplate('builtin-volume')!;
    expect(t.content).toContain('{{volume}}');
    expect(t.content).toContain('存档节点');
    expect(t.content).toContain('关键事件索引');
    expect(t.content).toContain('角色图鉴');
    expect(t.content).toContain('卷末状态');
  });

  it('日记模板含 {{char}} 宏与日记体要求', () => {
    const t = getBuiltinTemplate('builtin-diary')!;
    expect(t.content).toContain('{{char}}');
    expect(t.content).toContain('第一人称');
  });

  it('内置模板已洁版化：不含私人硬编码名与敏感字段（语义锁定，防回归）', () => {
    for (const t of BUILTIN_SUMMARY_TEMPLATES) {
      expect(t.content).not.toContain('林劫');
      expect(t.content).not.toContain('性经验');
      expect(t.content).not.toContain('敏感带');
    }
  });
});

describe('templateMatchesKind', () => {
  it('kind 精确匹配', () => {
    expect(templateMatchesKind({ kind: 'volume' }, 'volume')).toBe(true);
    expect(templateMatchesKind({ kind: 'diary' }, 'volume')).toBe(false);
  });

  it('any 通用模板匹配所有 kind', () => {
    for (const kind of ['volume', 'diary', 'diy'] as SummaryKind[]) {
      expect(templateMatchesKind({ kind: 'any' }, kind)).toBe(true);
    }
  });
});
