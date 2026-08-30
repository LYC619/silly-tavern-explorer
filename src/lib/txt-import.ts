/**
 * TXT 对话格式导入的纯解析逻辑（从 ChatImporter 提取，便于测试）。
 * 规则：每行「说话人: 内容」，冒号前(位置 1~29)为姓名；
 *  - 全小写/下划线的"姓名"视为属性行（如 mood: happy），并入上一条消息；
 *  - 无冒号的行并入上一条消息，开头无归属时记为 Narrator；
 *  - role 由「该行姓名是否等于用户选择的用户名」决定，姓名一律保留到 message.name。
 */

import type { ChatMessage } from '@/types/chat';

/** 说话人及其出现次数——次数是给用户判断「这是真人还是行首噪音」的唯一线索 */
export interface TxtSpeakerStat {
  name: string;
  count: number;
}

/** 提取 TXT 中出现过的所有说话人姓名与出现次数（按出现顺序去重，排除属性行） */
export function scanTxtSpeakerStats(content: string): TxtSpeakerStat[] {
  const counts = new Map<string, number>();
  for (const line of content.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx <= 0 || colonIdx >= 30) continue;
    const name = line.slice(0, colonIdx).trim();
    const text = line.slice(colonIdx + 1).trim();
    if (!name || !text) continue;
    if (/^[a-z_]+$/.test(name)) continue; // 属性行，不是说话人
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count }));
}

/** 提取 TXT 中出现过的所有说话人姓名（按出现顺序去重，排除属性行） */
export function scanTxtSpeakers(content: string): string[] {
  return scanTxtSpeakerStats(content).map(s => s.name);
}

/**
 * 解析对话格式 TXT。userName 为用户选择的「哪个姓名是用户」：
 * 等于它的行 role=user，其余说话人一律 role=assistant，姓名都保留。
 *
 * allowedSpeakers 是用户勾选的说话人名单：只有名单里的名字才开新楼，
 * 其余「像说话人」的行（`注:`、`时间: 傍晚`、`第一章: 相遇`……）并入上一条。
 * 光靠「全小写视为属性行」拦不住中文和大写开头的噪音，正文里每冒出一个这种前缀
 * 就多一位假角色，导入完满屏是没说过话的人。不传名单时保持旧行为。
 */
export function parseTxtDialogue(
  content: string,
  userName?: string,
  allowedSpeakers?: readonly string[],
): ChatMessage[] {
  const lines = content.split('\n').filter(l => l.trim());
  const messages: ChatMessage[] = [];
  const targetUserName = userName || 'User';
  // 空名单当没传：否则一个都不勾就把整个文件压成一条 Narrator，用户看不懂发生了什么
  const allowList = allowedSpeakers?.length ? new Set(allowedSpeakers) : null;

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    const name = colonIdx > 0 && colonIdx < 30 ? line.slice(0, colonIdx).trim() : '';
    const text = name ? line.slice(colonIdx + 1).trim() : '';
    // 全小写/下划线的「姓名」是属性行（mood: happy），名单模式下不在名单里的也一样：都不开新楼
    const isSpeaker = !!name && !!text
      && !/^[a-z_]+$/.test(name)
      && (!allowList || allowList.has(name));

    if (isSpeaker) {
      messages.push({
        id: crypto.randomUUID(),
        role: name === targetUserName ? 'user' : 'assistant',
        content: text,
        name,
      });
      continue;
    }
    // 不开新楼的行（属性行、名单外的前缀、无冒号的叙述）并入上一条；开头无归属时记为 Narrator
    if (messages.length > 0) {
      messages[messages.length - 1].content += '\n' + line.trim();
    } else {
      messages.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: line.trim(),
        name: 'Narrator',
      });
    }
  }
  return messages;
}
