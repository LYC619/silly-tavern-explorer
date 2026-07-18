/**
 * TXT 对话格式导入的纯解析逻辑（从 ChatImporter 提取，便于测试）。
 * 规则：每行「说话人: 内容」，冒号前(位置 1~29)为姓名；
 *  - 全小写/下划线的"姓名"视为属性行（如 mood: happy），并入上一条消息；
 *  - 无冒号的行并入上一条消息，开头无归属时记为 Narrator；
 *  - role 由「该行姓名是否等于用户选择的用户名」决定，姓名一律保留到 message.name。
 */

import type { ChatMessage } from '@/types/chat';

/** 提取 TXT 中出现过的所有说话人姓名（按出现顺序去重，排除属性行） */
export function scanTxtSpeakers(content: string): string[] {
  const names: string[] = [];
  for (const line of content.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx <= 0 || colonIdx >= 30) continue;
    const name = line.slice(0, colonIdx).trim();
    const text = line.slice(colonIdx + 1).trim();
    if (!name || !text) continue;
    if (/^[a-z_]+$/.test(name)) continue; // 属性行，不是说话人
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * 解析对话格式 TXT。userName 为用户选择的「哪个姓名是用户」：
 * 等于它的行 role=user，其余说话人一律 role=assistant，姓名都保留。
 */
export function parseTxtDialogue(content: string, userName?: string): ChatMessage[] {
  const lines = content.split('\n').filter(l => l.trim());
  const messages: ChatMessage[] = [];
  const targetUserName = userName || 'User';

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && colonIdx < 30) {
      const name = line.slice(0, colonIdx).trim();
      const text = line.slice(colonIdx + 1).trim();
      // Filter attribute lines: lowercase_only names are properties, not dialogue
      if (name && text && /^[a-z_]+$/.test(name)) {
        // Attribute line — append to last message
        if (messages.length > 0) {
          messages[messages.length - 1].content += '\n' + line.trim();
        }
        continue;
      }
      if (name && text) {
        messages.push({
          id: crypto.randomUUID(),
          role: name === targetUserName ? 'user' : 'assistant',
          content: text,
          name,
        });
        continue;
      }
    }
    // Lines without colon: append to last message or create new
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
