import { describe, expect, it } from 'vitest';
import * as presentationModule from '@/lib/vault/st-import-presentation';
import {
  buildImportResultStatus,
  countImportPicks,
  groupUnresolvedRelationships,
  type STImportPicks,
} from '@/lib/vault/st-import-presentation';
import type { STImportDetail, STUnresolvedRelationship } from '@/lib/vault/st-import';

type PresentationApi = typeof presentationModule & {
  buildImportManifestNotice: (details: STImportDetail[]) => { saved: boolean; description: string };
};

const presentation = presentationModule as PresentationApi;

describe('ST 导入展示模型', () => {
  it('按世界书名称和原因聚合未解析关联，并去重受影响对象与关系类型', () => {
    const relationships: STUnresolvedRelationship[] = [
      { owner: '角色甲', name: '缺失世界书', relation: 'chat', reason: 'missing' },
      { owner: '角色乙', name: '缺失世界书', relation: 'extra', reason: 'missing' },
      { owner: '角色甲', name: '缺失世界书', relation: 'chat', reason: 'missing' },
      { owner: '角色丙', name: '缺失世界书', relation: 'primary', reason: 'ambiguous' },
      { owner: '角色甲', name: '另一世界书', relation: 'global', reason: 'missing' },
    ];

    expect(groupUnresolvedRelationships(relationships)).toEqual([
      {
        name: '缺失世界书',
        reason: 'missing',
        count: 3,
        owners: ['角色甲', '角色乙'],
        relations: ['chat', 'extra'],
      },
      {
        name: '缺失世界书',
        reason: 'ambiguous',
        count: 1,
        owners: ['角色丙'],
        relations: ['primary'],
      },
      {
        name: '另一世界书',
        reason: 'missing',
        count: 1,
        owners: ['角色甲'],
        relations: ['global'],
      },
    ]);
  });

  it('把跨类别勾选统一计数，供摘要和导入按钮共用', () => {
    const picks: STImportPicks = {
      chars: new Set(['char-a', 'char-b']),
      strays: new Set(['chat-a']),
      wbs: new Set(['book-a']),
      presets: new Set(),
      regex: true,
      archives: new Set(['assets', 'extensions']),
      settingsRelations: true,
    };

    expect(countImportPicks(picks)).toBe(8);
  });

  it('重复策略把所有其他资产统一说明为同路径更新归档', () => {
    expect(presentationModule.IMPORT_POLICY_SUMMARY).toContain('其他资产按同路径更新归档');
    expect(presentationModule.IMPORT_POLICY_SUMMARY).not.toContain('扩展与媒体按同路径更新归档');
  });

  it('只有扫描警告时明确说明安全跳过，不误报为全部正常', () => {
    expect(buildImportResultStatus({ failed: 0, unresolved: 0, warnings: 2 })).toEqual({
      needsAttention: true,
      title: '所选内容已处理，部分项目需要确认',
      description: '扫描时为保护目录边界安全跳过了 2 项；其余所选内容已正常处理。',
    });
    expect(buildImportResultStatus({ failed: 0, unresolved: 0, warnings: 0 }).needsAttention).toBe(false);
  });

  it('把磁盘或归档错误统一称为处理失败，不误报成解析失败', () => {
    const status = buildImportResultStatus({ failed: 2, unresolved: 0, warnings: 0 });
    expect(status.description).toContain('2 项处理失败');
    expect(status.description).not.toContain('解析失败');
  });

  it('只有导入清单实际写入成功时才告诉用户完整清单已保存', () => {
    expect(presentation.buildImportManifestNotice).toBeTypeOf('function');
    expect(presentation.buildImportManifestNotice([])).toEqual({
      saved: true,
      description: '完整清单已保存到“说明/SillyTavern 最近一次导入.json”。',
    });
    expect(presentation.buildImportManifestNotice([
      { status: 'failed', kind: '导入清单', name: '说明/SillyTavern 最近一次导入.json' },
    ])).toEqual({
      saved: false,
      description: '本次结果已显示，但完整清单写入失败；请展开处理明细查看原因。',
    });
  });
});
