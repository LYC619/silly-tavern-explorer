import type {
  STImportDetail,
  STImportSummary,
  STScanResult,
  STUnresolvedRelationship,
} from '@/lib/vault/st-import';

export interface STImportPicks {
  chars: Set<string>;
  strays: Set<string>;
  wbs: Set<string>;
  presets: Set<string>;
  regex: boolean;
  archives: Set<string>;
  settingsRelations: boolean;
}

export interface STUnresolvedGroup {
  name: string;
  reason: STUnresolvedRelationship['reason'];
  count: number;
  owners: string[];
  relations: STUnresolvedRelationship['relation'][];
}

/** 导入前必须让用户看懂的重复项策略，选择弹窗和入口卡共用。 */
export const IMPORT_POLICY_SUMMARY = '同一路径的角色、聊天、世界书、预设和正则会跳过；其他资产按同路径更新归档，不会改动来源文件。';

export interface ImportResultStatusInput {
  failed: number;
  unresolved: number;
  warnings: number;
}

export interface ImportResultStatus {
  needsAttention: boolean;
  title: string;
  description: string;
}

export function buildImportResultStatus({
  failed,
  unresolved,
  warnings,
}: ImportResultStatusInput): ImportResultStatus {
  if (failed > 0) {
    return {
      needsAttention: true,
      title: '所选内容已处理，部分项目需要确认',
      description: `${failed} 项处理失败，其余成功结果不受影响。`,
    };
  }
  if (unresolved > 0) {
    return {
      needsAttention: true,
      title: '所选内容已处理，部分项目需要确认',
      description: '部分历史世界书引用在来源目录中不存在或无法唯一匹配，其余内容已正常导入。',
    };
  }
  if (warnings > 0) {
    return {
      needsAttention: true,
      title: '所选内容已处理，部分项目需要确认',
      description: `扫描时为保护目录边界安全跳过了 ${warnings} 项；其余所选内容已正常处理。`,
    };
  }
  return {
    needsAttention: false,
    title: '所选内容已全部处理',
    description: '没有发现解析失败、未解决的世界书关联或扫描警告。',
  };
}

const IMPORT_MANIFEST_PATH = '说明/SillyTavern 最近一次导入.json';

export interface ImportManifestNotice {
  saved: boolean;
  description: string;
}

export function buildImportManifestNotice(details: STImportDetail[]): ImportManifestNotice {
  const writeFailed = details.some((detail) => detail.kind === '导入清单' && detail.status === 'failed');
  if (writeFailed) {
    return {
      saved: false,
      description: '本次结果已显示，但完整清单写入失败；请展开处理明细查看原因。',
    };
  }
  return {
    saved: true,
    description: `完整清单已保存到“${IMPORT_MANIFEST_PATH}”。`,
  };
}

export function createAllImportPicks(scan: STScanResult): STImportPicks {
  return {
    chars: new Set(scan.characters.map((character) => character.pngPath)),
    strays: new Set(scan.strayChats.map((chat) => chat.path)),
    wbs: new Set(scan.worldbooks.map((worldbook) => worldbook.path)),
    presets: new Set(scan.presets.map((preset) => preset.path)),
    regex: scan.regex !== null,
    archives: new Set(scan.archives.map((group) => group.kind)),
    settingsRelations: scan.relationships.status === 'parsed',
  };
}

export function createEmptyImportPicks(): STImportPicks {
  return {
    chars: new Set(),
    strays: new Set(),
    wbs: new Set(),
    presets: new Set(),
    regex: false,
    archives: new Set(),
    settingsRelations: false,
  };
}

export function toggleImportPick(set: Set<string>, key: string, checked: boolean): Set<string> {
  const next = new Set(set);
  if (checked) next.add(key);
  else next.delete(key);
  return next;
}

export function countImportPicks(picks: STImportPicks): number {
  return picks.chars.size + picks.strays.size + picks.wbs.size + picks.presets.size
    + picks.archives.size + (picks.regex ? 1 : 0) + (picks.settingsRelations ? 1 : 0);
}

export function groupUnresolvedRelationships(
  relationships: STImportSummary['unresolvedRelationships'],
): STUnresolvedGroup[] {
  const groups = new Map<string, STUnresolvedGroup>();

  for (const relationship of relationships) {
    const key = `${relationship.reason}\u0000${relationship.name}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (!existing.owners.includes(relationship.owner)) existing.owners.push(relationship.owner);
      if (!existing.relations.includes(relationship.relation)) existing.relations.push(relationship.relation);
      continue;
    }

    groups.set(key, {
      name: relationship.name,
      reason: relationship.reason,
      count: 1,
      owners: [relationship.owner],
      relations: [relationship.relation],
    });
  }

  return [...groups.values()];
}
