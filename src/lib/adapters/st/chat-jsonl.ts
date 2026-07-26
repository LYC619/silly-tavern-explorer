/**
 * SillyTavern 聊天文件解析（JSONL / JSON）——纯函数，无 UI 依赖。
 * 自 ChatImporter.tsx 抽出（2.0 阶段0）：适配器边界上的入口之一，
 * 出口统一为 @/types/chat 的 ChatMessage/STMetadata。
 */
import type { ChatMessage, ChatSession, STMetadata, STRawMessage } from '@/types/chat';

/**
 * 解析 SillyTavern 的 send_date 为时间戳（毫秒）。ST 有两种字符串格式 JS 原生 Date 解析不了：
 *  1. "November 14, 2024 6:18am"        —— am/pm 紧贴小时，缺空格
 *  2. "2024-11-14 @06h 18m 30s 500ms"   —— @小时h 分m 秒s 毫秒ms
 * 解析失败返回 undefined（而非 NaN），避免显示出 Invalid Date。
 */
export function parseSTDate(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const s = value.trim();

  // 格式 2： "YYYY-M-D @HHh MMm SSs MMMms"
  const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s*@\s*(\d{1,2})h\s*(\d{1,2})m\s*(\d{1,2})s(?:\s*(\d{1,3})ms)?/i);
  if (m2) {
    const [, y, mo, d, h, mi, se, ms] = m2;
    const t = new Date(+y, +mo - 1, +d, +h, +mi, +se, ms ? +ms : 0).getTime();
    return Number.isFinite(t) ? t : undefined;
  }

  // 格式 1：给紧贴的 am/pm 补空格后交给原生 Date（"6:18am" -> "6:18 am"）
  const normalized = s.replace(/(\d)(am|pm)\b/i, '$1 $2');
  const t = new Date(normalized).getTime();
  return Number.isFinite(t) ? t : undefined;
}

/**
 * 区分「真·系统提示」和「被 Hide 的真实楼层」。
 * ST 的「Hide message」是把 is_system 置 true 持久化的（不是加 extra.hidden），
 * 与 /sys、/comment 等注入型系统消息共用 is_system 字段。一刀切丢弃 is_system 会连
 * 被隐藏的开场白/正常楼层一起丢掉（表现为「导入缺失、后面内容看似顶掉前面」）。
 * 返回 true = 真系统提示，应跳过；false = 只是被隐藏的真实楼层，应导入并标 hidden。
 * 判据（满足任一即真系统）：mes 为空 / 既无 name 又无 is_user（纯注入）/ extra.type ∈ {narrator,system}。
 */
export function isTrueSystemMessage(raw: {
  mes?: string; content?: string; message?: string;
  is_user?: unknown; name?: unknown; extra?: { type?: unknown } | null;
}): boolean {
  const content = raw.mes || raw.content || raw.message || '';
  if (!content) return true;
  if (raw.is_user == null && raw.name == null) return true;
  const type = raw.extra?.type;
  return type === 'narrator' || type === 'system';
}

/** 解析 ST 聊天 JSONL（首行元数据 + 每行一条消息）。坏行跳过不中断。 */
export function parseJsonl(content: string): { messages: ChatMessage[]; metadata?: STMetadata } {
  const lines = content.trim().split('\n');
  const messages: ChatMessage[] = [];
  let metadata: STMetadata | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as STRawMessage;
      if (i === 0 && ('user_name' in parsed || 'character_name' in parsed || 'chat_metadata' in parsed)) {
        metadata = parsed as STMetadata;
        continue;
      }
      if (parsed.is_system && isTrueSystemMessage(parsed)) continue;
      const messageContent = parsed.mes || parsed.content || parsed.message || '';
      if (!messageContent) continue;
      messages.push({
        id: crypto.randomUUID(),
        role: parsed.is_user ? 'user' : 'assistant',
        content: messageContent,
        name: parsed.name || (parsed.is_user ? 'User' : 'Character'),
        timestamp: parseSTDate(parsed.send_date),
        hidden: parsed.is_system === true,
        rawData: parsed,
      });
    } catch {
      console.warn('Failed to parse line:', line);
    }
  }
  return { messages, metadata };
}

/**
 * 把会话序列化回 ST JSONL（首行元数据 + 每消息一行），与 parseJsonl 互逆。
 * 供文件库派生的「ST 工作版」（聊天.jsonl / 分支·X.jsonl，只写不读）使用。
 * 与 ExportButton.exportAsJsonl 不同：这里不做正则清理、不去 swipes——工作版要无损，
 * rawData 原样输出；无 rawData 的消息合成最小字段（name/is_user/send_date/mes）。
 */
export function serializeChatJsonl(session: ChatSession): string {
  const metadata: STMetadata = session.rawMetadata ?? {
    user_name: session.user?.name || 'User',
    character_name: session.character?.name || 'Character',
  };
  const lines: string[] = [JSON.stringify(metadata)];
  for (const m of session.messages) {
    const raw: STRawMessage = m.rawData ?? {
      name: m.name || (m.role === 'user' ? session.user?.name || 'User' : session.character?.name || 'Character'),
      is_user: m.role === 'user',
      send_date: m.timestamp ?? Date.now(),
      mes: m.content,
    };
    lines.push(JSON.stringify(raw));
  }
  return lines.join('\n');
}

/** 解析 ST 聊天 JSON（消息数组，或含 messages / chat 字段的对象）。 */
export function parseJson(content: string): { messages: ChatMessage[]; metadata?: STMetadata } {
  const data = JSON.parse(content);
  if (Array.isArray(data)) {
    const messages = data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ST 原始 JSON 字段随版本/插件变化，保持宽松以免丢字段
      .filter((item: any) => !(item.is_system && isTrueSystemMessage(item)))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 同上，rawData 需原样保留
      .map((item: any) => ({
        id: crypto.randomUUID(),
        role: (item.is_user || item.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: item.mes || item.content || item.message || '',
        name: item.name || (item.is_user ? 'User' : 'Character'),
        timestamp: parseSTDate(item.send_date),
        hidden: item.is_system === true,
        rawData: item as STRawMessage,
      }))
      .filter((m: ChatMessage) => m.content);
    return { messages };
  }
  if (data.messages || data.chat) {
    const msgs = data.messages || data.chat;
    const messages = msgs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ST 原始 JSON 字段随版本/插件变化，保持宽松以免丢字段
      .filter((item: any) => !(item.is_system && isTrueSystemMessage(item)))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 同上，rawData 需原样保留
      .map((item: any) => ({
        id: crypto.randomUUID(),
        role: (item.is_user || item.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: item.mes || item.content || item.message || '',
        name: item.name,
        timestamp: parseSTDate(item.send_date),
        hidden: item.is_system === true,
        rawData: item as STRawMessage,
      }))
      .filter((m: ChatMessage) => m.content);
    return { messages };
  }
  throw new Error('无法识别的 JSON 格式（应为消息数组，或含 messages / chat 字段的对象）');
}
