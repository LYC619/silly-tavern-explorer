/**
 * 侧栏「编辑区」可展开的最近处理条目（10.1-A4）。
 * 不新增埋点：从现有数据派生——未绑定故事（聊天处理暂存）+ 世界书/预设/正则资产，
 * 统一按 updatedAt 取最近 N 条。跳转走各工具页已有的 ?assetId= 深链 / 故事工作区。
 */

export type RecentEditKind = 'chat' | 'worldbook' | 'preset' | 'regex';

export interface RecentEditItem {
  kind: RecentEditKind;
  id: string;
  title: string;
  at: number;
  path: string;
}

export const RECENT_EDIT_KIND_LABEL: Record<RecentEditKind, string> = {
  chat: '聊天',
  worldbook: '世界书',
  preset: '预设',
  regex: '正则',
};

interface PickInput {
  /** 归档故事全量：只取未绑定的（characterId 为空 = 聊天处理暂存件） */
  stories: { id: string; title: string; characterId?: string; updatedAt: number }[];
  worldbooks: { id: string; title: string; updatedAt: number }[];
  presets: { id: string; title: string; updatedAt: number }[];
  regexes: { id: string; title: string; updatedAt: number }[];
}

export function pickRecentEdits(input: PickInput, limit = 6): RecentEditItem[] {
  const items: RecentEditItem[] = [
    ...input.stories
      .filter((s) => !s.characterId)
      .map<RecentEditItem>((s) => ({
        kind: 'chat', id: s.id, title: s.title, at: s.updatedAt, path: `/story/${s.id}`,
      })),
    ...input.worldbooks.map<RecentEditItem>((w) => ({
      kind: 'worldbook', id: w.id, title: w.title, at: w.updatedAt, path: `/worldbook?assetId=${w.id}`,
    })),
    ...input.presets.map<RecentEditItem>((p) => ({
      kind: 'preset', id: p.id, title: p.title, at: p.updatedAt, path: `/preset?assetId=${p.id}`,
    })),
    ...input.regexes.map<RecentEditItem>((r) => ({
      kind: 'regex', id: r.id, title: r.title, at: r.updatedAt, path: `/regex?assetId=${r.id}`,
    })),
  ];
  return items.sort((a, b) => b.at - a.at).slice(0, limit);
}
