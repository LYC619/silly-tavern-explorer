/**
 * 故事归档元数据解析（2.0 阶段0）：从 ST 原始消息提取模型与估算游玩时长。
 * 纯函数，供角色卡主页故事行（阶段1）与故事工作区使用。
 *
 * 字段依据（codex 会话已核对 ST 源码，见 findings.md 二）：
 * - 模型：extra.model / extra.api；重掷后必须读当前 swipe_info[swipe_id]，不能只看顶层
 * - 时间：gen_started / gen_finished（ISO，优先）→ send_date（两种奇葩格式）→ 不可靠则「未统计」
 */
import type { ChatMessage, STRawMessage } from '@/types/chat';
import { parseSTDate } from '@/lib/adapters/st/chat-jsonl';

/** 15 分钟：游玩时段切分阈值（定稿第四章，用户选 3B 固定 15 分钟） */
export const PLAY_SESSION_GAP_MS = 15 * 60_000;

/**
 * 取单条消息「当前生效」的模型名。
 * 优先当前选中 swipe 的元数据（重掷后顶层 extra 可能是旧值），回退顶层 extra.model。
 */
export function extractMessageModel(raw: STRawMessage | undefined): string | undefined {
  if (!raw) return undefined;
  const swipeId = typeof raw.swipe_id === 'number' ? raw.swipe_id : undefined;
  if (swipeId !== undefined && Array.isArray(raw.swipe_info)) {
    const info = raw.swipe_info[swipeId];
    const m = info?.extra?.model;
    if (typeof m === 'string' && m) return m;
  }
  const m = raw.extra?.model;
  return typeof m === 'string' && m ? m : undefined;
}

/** 提取整个故事使用过的模型：按首次出现顺序去重 + 最近一次出现的模型 */
export function extractModels(messages: ChatMessage[]): { modelsUsed: string[]; lastModel?: string } {
  const seen = new Set<string>();
  const modelsUsed: string[] = [];
  let lastModel: string | undefined;
  for (const msg of messages) {
    const model = extractMessageModel(msg.rawData);
    if (!model) continue;
    if (!seen.has(model)) {
      seen.add(model);
      modelsUsed.push(model);
    }
    lastModel = model;
  }
  return { modelsUsed, lastModel };
}

/** 取单条消息的最佳时间戳：gen_finished > gen_started > send_date > 导入时解析好的 timestamp */
function messageTime(msg: ChatMessage): number | undefined {
  const raw = msg.rawData;
  if (raw) {
    const t = parseSTDate(raw.gen_finished) ?? parseSTDate(raw.gen_started) ?? parseSTDate(raw.send_date);
    if (t !== undefined) return t;
  }
  return msg.timestamp;
}

export interface PlayTimeEstimate {
  /** 总游玩时长（各时段跨度之和，毫秒） */
  totalMs: number;
  /** 时段数（间隔超过阈值切开） */
  sessionCount: number;
  /** 参与估算的消息数（带有效时间戳的） */
  sampledMessages: number;
}

/**
 * 估算游玩时长：把消息时间戳按连续活动合并为时段（间隔 > gapMs 算新时段），
 * 总时长 = 各时段(末-首)之和。有效时间戳不足 2 条返回 null（UI 显示「未统计」）。
 */
export function estimatePlayTime(messages: ChatMessage[], gapMs = PLAY_SESSION_GAP_MS): PlayTimeEstimate | null {
  const times = messages
    .map(messageTime)
    .filter((t): t is number => t !== undefined)
    .sort((a, b) => a - b);
  if (times.length < 2) return null;

  let totalMs = 0;
  let sessionCount = 1;
  let sessionStart = times[0];
  let prev = times[0];
  for (let i = 1; i < times.length; i++) {
    const t = times[i];
    if (t - prev > gapMs) {
      totalMs += prev - sessionStart;
      sessionCount++;
      sessionStart = t;
    }
    prev = t;
  }
  totalMs += prev - sessionStart;
  return { totalMs, sessionCount, sampledMessages: times.length };
}

/** 格式化时长为「12.4 小时 / 46 分钟」样式；null → 「未统计」 */
export function formatPlayTime(estimate: PlayTimeEstimate | null): string {
  if (!estimate) return '未统计';
  const minutes = estimate.totalMs / 60_000;
  if (minutes < 1) return '不足 1 分钟';
  if (minutes < 60) return `${Math.round(minutes)} 分钟`;
  const hours = Math.round((minutes / 60) * 10) / 10; // 保留 1 位小数（整数自然不显示小数）
  return `${hours} 小时`;
}
