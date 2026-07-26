/**
 * 重复导入合并（2.0 阶段4，定稿 5.3①）——纯函数，无 UI/存储依赖。
 *
 * 规则（**无逐条 diff 界面**）：
 * - 楼层按下标对齐（两边都经同一解析器，真系统楼已剔除，序号一致）。
 * - 导入文件多出的新楼直接追加。
 * - 同一楼两边正文不同：ST 新版当正文，STE 编辑版转成该楼 swipe 并标「STE 编辑版」；
 *   保留 STE 侧消息 id（章节/收藏/阅读位置都按 messageId 锚定，不能换）。
 * - 导入文件比现有短：STE 独有楼原样保留，永不删楼。
 * - 元数据（JSONL 首行）以导入文件为准刷新。
 * - 完成后给一句摘要：「新增 20 楼，2 楼有改动已存为 swipe」。
 */
import type { ChatMessage, ChatSession, STMetadata, STRawMessage } from '@/types/chat';

/** 标在 swipe_info[i].extra 上的旗标，UI 据此显示「STE 编辑版」徽标 */
export const STE_EDIT_SWIPE_FLAG = 'ste_edited_version';

export interface ReimportMergeResult {
  session: ChatSession;
  /** 追加的新楼数 */
  added: number;
  /** 正文有改动的楼数（STE 版已转 swipe，或候选里本来就有） */
  conflicted: number;
  /** 实际新增为 swipe 的条数（STE 版已在候选中时不重复加） */
  swipesAdded: number;
  /** 导入文件里没有、STE 独有而保留的楼数 */
  keptExtra: number;
  /** 是否有任何变化（决定要不要落库） */
  changed: boolean;
  /** 一句话摘要（toast 用） */
  summary: string;
}

/**
 * 冲突楼合并：ST 版整条为基底（正文/rawData 都以 ST 为准），
 * 只保留 STE 侧的消息 id，并把 STE 正文追加为一条打了旗标的 swipe。
 * 特例：STE 正文本来就在导入楼的候选池里（用户只是切了 swipe，不是编辑）——
 * 不重复存，改为在 ST 新数据上保留 STE 的选中。
 */
function mergeConflictFloor(cur: ChatMessage, imp: ChatMessage): { msg: ChatMessage; swipeAdded: boolean } {
  const raw: STRawMessage = imp.rawData ? { ...imp.rawData } : { mes: imp.content };
  const steText = cur.content;
  const existing = Array.isArray(raw.swipes) ? (raw.swipes as string[]) : null;

  const k = existing ? existing.indexOf(steText) : -1;
  if (k >= 0) {
    raw.swipe_id = k;
    raw.mes = steText;
    return {
      msg: { ...imp, id: cur.id, content: steText, timestamp: cur.timestamp, rawData: raw },
      swipeAdded: false,
    };
  }

  // 无候选池的楼先以 ST 正文起池（swipe_id 指向它，正文仍是 ST 版）
  const swipes = existing ? [...existing] : [imp.content];
  if (!existing) raw.swipe_id = 0;
  const info = Array.isArray(raw.swipe_info) ? [...raw.swipe_info] : [];
  while (info.length < swipes.length) info.push({});
  swipes.push(steText);
  info.push({
    send_date: cur.rawData?.send_date,
    extra: { [STE_EDIT_SWIPE_FLAG]: true, title: 'STE 编辑版' },
  });
  raw.swipes = swipes;
  raw.swipe_info = info;
  return { msg: { ...imp, id: cur.id, rawData: raw }, swipeAdded: true };
}

/**
 * 把同一故事的 ST 聊天文件再次导入，合并进现有脉络。
 * current = STE 里的当前会话；imported = parseJsonl/parseJson 的解析结果。
 * 标题与角色/用户名保留 STE 侧（用户可能已改名）。
 */
export function mergeReimport(
  current: ChatSession,
  imported: { messages: ChatMessage[]; metadata?: STMetadata },
): ReimportMergeResult {
  const cur = current.messages;
  const imp = imported.messages;
  const shared = Math.min(cur.length, imp.length);

  const merged: ChatMessage[] = [];
  let conflicted = 0;
  let swipesAdded = 0;

  for (let i = 0; i < shared; i++) {
    if (cur[i].content === imp[i].content) {
      merged.push(cur[i]);
      continue;
    }
    const { msg, swipeAdded } = mergeConflictFloor(cur[i], imp[i]);
    merged.push(msg);
    conflicted++;
    if (swipeAdded) swipesAdded++;
  }
  for (let i = shared; i < imp.length; i++) merged.push(imp[i]);
  for (let i = shared; i < cur.length; i++) merged.push(cur[i]);

  const added = Math.max(0, imp.length - cur.length);
  const keptExtra = Math.max(0, cur.length - imp.length);

  const metadataChanged =
    imported.metadata !== undefined &&
    JSON.stringify(imported.metadata) !== JSON.stringify(current.rawMetadata);
  const changed = added > 0 || conflicted > 0 || metadataChanged;

  const parts: string[] = [];
  if (added > 0) parts.push(`新增 ${added} 楼`);
  if (swipesAdded > 0) parts.push(`${swipesAdded} 楼有改动已存为 swipe`);
  const selectionKept = conflicted - swipesAdded;
  if (selectionKept > 0) parts.push(`${selectionKept} 楼候选池已更新`);
  if (keptExtra > 0) parts.push(`STE 独有 ${keptExtra} 楼已保留`);
  if (parts.length === 0) parts.push(metadataChanged ? '楼层一致，已刷新元数据' : '与导入文件一致，没有变化');

  const session: ChatSession = changed
    ? {
        ...current,
        messages: merged,
        rawMetadata: imported.metadata ?? current.rawMetadata,
      }
    : current;

  return { session, added, conflicted, swipesAdded, keptExtra, changed, summary: parts.join('，') };
}
