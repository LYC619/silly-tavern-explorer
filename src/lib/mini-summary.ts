/**
 * 小总结提取：从聊天记录里用正则抽出每楼 AI 消息自带的「小结」，与其前一条用户消息配对展示。
 * 归档场景：用户玩时常用特定符号包住小结（如 <summary>…</summary> 或自定义标记），
 * 这里只做「提取 + 配对」，不改动原始聊天。纯函数，复用 regex-processor 的编译。
 */

import type { ChatSession } from '@/types/chat';
import { parseRegex } from '@/lib/regex-processor';

export interface MiniSummaryPair {
  /** AI 楼层在 session.messages 中的 0-based 下标 */
  floor: number;
  /** 配对的用户消息（紧邻其前的最近 user 楼层，可能为空） */
  userText: string;
  /** 提取出的小结文本 */
  summary: string;
}

/**
 * 从正则 match 中取小结：优先第一个捕获组，无捕获组则取整段匹配。
 * 支持 /g：多段匹配时用换行拼接。
 */
function extractSummary(text: string, re: RegExp): string {
  const parts: string[] = [];
  if (re.global) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      parts.push((m[1] ?? m[0]).trim());
      if (m.index === re.lastIndex) re.lastIndex++; // 防零宽死循环
    }
  } else {
    const m = re.exec(text);
    if (m) parts.push((m[1] ?? m[0]).trim());
  }
  return parts.filter(Boolean).join('\n');
}

/**
 * 提取小总结配对列表。
 * @param session 当前会话
 * @param regexStr 用户提供的正则（/pattern/flags 形式；建议带捕获组框住小结）
 * @returns 每条含小结的 AI 楼层与其前一条用户消息的配对
 */
export function extractMiniSummaries(session: ChatSession, regexStr: string): MiniSummaryPair[] {
  const re = parseRegex(regexStr);
  if (!re) return [];
  const pairs: MiniSummaryPair[] = [];
  const msgs = session.messages;
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const isUser = m.role === 'user' || m.is_user === true;
    if (isUser) continue; // 只在 AI 楼层找小结
    const summary = extractSummary(m.content, re);
    if (!summary) continue;
    // 找紧邻其前的最近 user 消息
    let userText = '';
    for (let j = i - 1; j >= 0; j--) {
      const pm = msgs[j];
      if (pm.role === 'user' || pm.is_user === true) { userText = pm.content; break; }
    }
    pairs.push({ floor: i, userText, summary });
  }
  return pairs;
}

/** 配对列表 → 可读文本（用于复制/导出） */
export function miniSummariesToText(pairs: MiniSummaryPair[]): string {
  return pairs
    .map((p) => {
      const user = p.userText.trim() ? `【用户】${p.userText.trim()}\n` : '';
      return `${user}【小结 #${p.floor}】${p.summary}`;
    })
    .join('\n\n');
}
