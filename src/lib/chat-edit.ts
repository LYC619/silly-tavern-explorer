/**
 * 楼层编辑与 swipe 的纯函数（2.0 阶段2）。
 * ST 字段约束（findings.md 二，已核对 ST 源码）：
 * - 消息正文 = mes；重掷候选在 swipes[]，当前选中下标 swipe_id，逐条元数据在 swipe_info[]。
 * - 编辑当前 swipe 必须同步 mes 与 swipes[swipe_id]，否则导回 ST 后一刷新就回到旧文本。
 * - 切换 swipe 后模型/时间要读 swipe_info[swipe_id]，不能只看顶层字段。
 */
import type { ChatMessage } from '@/types/chat';
import { parseSTDate } from '@/lib/adapters/st/chat-jsonl';
import { STE_EDIT_SWIPE_FLAG } from '@/lib/adapters/st/reimport-merge';

/** 该楼的 swipe 候选数（无 swipes 或只有 1 条视为无候选可切） */
export function swipeCount(msg: ChatMessage): number {
  const swipes = msg.rawData?.swipes;
  return Array.isArray(swipes) ? swipes.length : 0;
}

/** 当前选中的 swipe 下标（缺省 0） */
export function currentSwipeId(msg: ChatMessage): number {
  const id = msg.rawData?.swipe_id;
  return typeof id === 'number' && id >= 0 ? id : 0;
}

/**
 * 切换到第 targetId 条候选：content/rawData.mes/swipe_id 三处同步，
 * 时间戳优先取 swipe_info[targetId].send_date。越界或无候选时原样返回。
 */
export function selectSwipe(msg: ChatMessage, targetId: number): ChatMessage {
  const swipes = msg.rawData?.swipes;
  if (!Array.isArray(swipes) || targetId < 0 || targetId >= swipes.length) return msg;
  const content = swipes[targetId];
  if (typeof content !== 'string') return msg;
  const info = msg.rawData?.swipe_info?.[targetId] as { send_date?: unknown } | undefined;
  return {
    ...msg,
    content,
    timestamp: parseSTDate(info?.send_date) ?? msg.timestamp,
    rawData: { ...msg.rawData, mes: content, swipe_id: targetId },
  };
}

/**
 * 楼层编辑保存后的同步：把新正文写进 rawData.mes 与 swipes[swipe_id]（若存在），
 * 保证「STE 里改 → 导出 JSONL → 导回 ST」不被旧 swipe 文本顶掉。
 */
export function syncEditedMessage(updated: ChatMessage): ChatMessage {
  if (!updated.rawData) return updated;
  const raw = { ...updated.rawData, mes: updated.content };
  if (Array.isArray(raw.swipes)) {
    const id = currentSwipeId(updated);
    if (id < raw.swipes.length) {
      const swipes = [...raw.swipes];
      swipes[id] = updated.content;
      raw.swipes = swipes;
    }
  }
  return { ...updated, rawData: raw };
}

/** 解除普通隐藏楼；ST 用 is_system 持久化 Hide，因此两处必须同步清除。 */
export function unhideMessage(message: ChatMessage): ChatMessage {
  if (!message.hidden) return message;
  return {
    ...message,
    hidden: false,
    rawData: message.rawData ? { ...message.rawData, is_system: false } : message.rawData,
  };
}

/** OOC/注释楼（ST 的 /comment，extra.type='comment'）；与普通隐藏楼分开标注 */
export function isOOCMessage(msg: ChatMessage): boolean {
  return (msg.rawData?.extra as { type?: unknown } | undefined)?.type === 'comment';
}

/**
 * 当前选中候选是否为重复导入合并时保留的「STE 编辑版」
 * （阶段4：冲突楼 ST 版当正文，STE 版转 swipe 并在 swipe_info.extra 打旗标）。
 */
export function isSteEditedSwipe(msg: ChatMessage): boolean {
  const info = msg.rawData?.swipe_info?.[currentSwipeId(msg)] as
    | { extra?: Record<string, unknown> }
    | undefined;
  return info?.extra?.[STE_EDIT_SWIPE_FLAG] === true;
}
