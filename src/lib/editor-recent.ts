/**
 * 侧栏「编辑区」可展开的最近处理条目（10.1-A4）。
 * 不新增埋点：从现有故事、整理记录、故事树和资产数据派生，统一按 updatedAt
 * 取最近 N 条。跳转走各工具页已有的 ?assetId= 深链 / 故事工作区。
 */

export type RecentEditKind =
  | 'chat'
  | 'volume'
  | 'diary'
  | 'diy'
  | 'tree'
  | 'card'
  | 'worldbook'
  | 'preset'
  | 'regex';

export interface RecentEditNavigationState {
  view: 'volume' | 'diary' | 'diy' | 'tree';
  initialTarget: { type: 'record' | 'tree'; id: string };
}

export interface RecentEditItem {
  kind: RecentEditKind;
  id: string;
  title: string;
  at: number;
  path: string;
  state?: RecentEditNavigationState;
}

export const RECENT_EDIT_KIND_LABEL: Record<RecentEditKind, string> = {
  chat: '聊天',
  volume: '分卷总结',
  diary: '角色日记',
  diy: '自定义记录',
  tree: '故事树',
  card: '角色卡',
  worldbook: '世界书',
  preset: '预设',
  regex: '正则',
};

interface PickInput {
  /** 归档故事全量，包括已绑定角色和未绑定的聊天处理暂存件。 */
  stories: { id: string; title: string; characterId?: string; updatedAt: number }[];
  summaries: {
    id: string;
    title: string;
    kind: 'volume' | 'diary' | 'diy';
    bookId: string | null;
    updatedAt: number;
  }[];
  trees: { id: string; title: string; bookId: string | null; updatedAt: number }[];
  cards: { id: string; title: string; updatedAt: number }[];
  worldbooks: { id: string; title: string; updatedAt: number }[];
  presets: { id: string; title: string; updatedAt: number }[];
  regexes: { id: string; title: string; updatedAt: number }[];
}

export function pickRecentEdits(input: PickInput, limit = 6): RecentEditItem[] {
  const items: RecentEditItem[] = [
    ...input.stories.map<RecentEditItem>((s) => ({
      kind: 'chat', id: s.id, title: s.title, at: s.updatedAt, path: `/story/${s.id}`,
    })),
    ...input.summaries
      .filter((summary) => summary.bookId !== null)
      .map<RecentEditItem>((summary) => ({
        kind: summary.kind,
        id: summary.id,
        title: summary.title,
        at: summary.updatedAt,
        path: `/story/${summary.bookId}`,
        state: {
          view: summary.kind,
          initialTarget: { type: 'record', id: summary.id },
        },
      })),
    ...input.trees
      .filter((tree) => tree.bookId !== null)
      .map<RecentEditItem>((tree) => ({
        kind: 'tree',
        id: tree.id,
        title: tree.title,
        at: tree.updatedAt,
        path: `/story/${tree.bookId}`,
        state: {
          view: 'tree',
          initialTarget: { type: 'tree', id: tree.id },
        },
      })),
    ...input.cards.map<RecentEditItem>((card) => ({
      kind: 'card', id: card.id, title: card.title, at: card.updatedAt, path: `/card-viewer?assetId=${card.id}`,
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
