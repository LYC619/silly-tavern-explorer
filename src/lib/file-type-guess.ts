/**
 * 处理区入口的文件类型猜测（2.0 阶段5，定稿第六章）。
 * 丢进来一个文件，按扩展名 + 内容形状给出默认猜测，用户确认后分流到对应工具。
 * 这个选择器就是适配层：未来接其他角色扮演工具 = 加类型选项 + 导入适配器。
 */

export type ToolFileType = 'chat' | 'worldbook' | 'preset' | 'card' | 'regex';

export const TOOL_TYPE_LABELS: Record<ToolFileType, string> = {
  chat: '聊天记录',
  worldbook: '世界书',
  preset: '预设',
  card: '角色卡',
  regex: '正则规则',
};

/** 单条 ST 正则脚本的形状（scriptName + findRegex 是它的指纹） */
function looksLikeRegexScript(o: unknown): boolean {
  return !!o && typeof o === 'object' && 'findRegex' in (o as object) &&
    ('scriptName' in (o as object) || 'replaceString' in (o as object));
}

/** ST 聊天消息行的形状（mes 是 ST 的正文字段） */
function looksLikeChatMessage(o: unknown): boolean {
  if (!o || typeof o !== 'object') return false;
  const m = o as Record<string, unknown>;
  return typeof m.mes === 'string' || ('is_user' in m && 'send_date' in m);
}

/**
 * 猜测文件类型。content 建议传文件前 64KB 以上（JSON 需要能整体 parse 时传全文）；
 * 拿不准时返回 null，让用户自己选。
 */
export function guessFileType(fileName: string, content?: string): ToolFileType | null {
  const name = fileName.toLowerCase();
  if (name.endsWith('.png')) return 'card';
  if (name.endsWith('.jsonl')) return 'chat';
  if (name.endsWith('.txt')) return 'chat'; // TXT 对话/小说，或 ST 导出的伪 .txt JSONL，都归聊天工具
  if (!name.endsWith('.json')) return null;
  if (!content) return null;

  const trimmed = content.trim();

  // JSONL 伪装成 .json（每行一个对象）
  if (trimmed.startsWith('{') && trimmed.includes('\n{')) {
    const firstLine = trimmed.split('\n', 1)[0];
    try {
      const first = JSON.parse(firstLine);
      if (looksLikeChatMessage(first) || (first && typeof first === 'object' && 'user_name' in first)) return 'chat';
    } catch { /* 不是 JSONL，继续按整体 JSON 判 */ }
  }

  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return null;
    if (data.every(looksLikeRegexScript)) return 'regex';
    if (data.some(looksLikeChatMessage)) return 'chat';
    return null;
  }

  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;

  // 角色卡：V2/V3 有 spec 标记；V1 是顶层 name + first_mes
  if (obj.spec === 'chara_card_v2' || obj.spec === 'chara_card_v3') return 'card';
  if (typeof obj.name === 'string' && typeof obj.first_mes === 'string') return 'card';

  // 世界书：entries 是 uid → 条目 的映射
  if (obj.entries && typeof obj.entries === 'object' && !Array.isArray(obj.entries)) return 'worldbook';

  // 单条正则脚本
  if (looksLikeRegexScript(obj)) return 'regex';

  // 预设：prompts / prompt_order 是 Chat Completion 预设的指纹
  if (Array.isArray(obj.prompts) || Array.isArray(obj.prompt_order)) return 'preset';
  if ('temperature' in obj && ('openai_max_context' in obj || 'openai_max_tokens' in obj)) return 'preset';

  // 聊天：带 messages/chat 数组的导出
  if (Array.isArray(obj.messages) || Array.isArray(obj.chat)) return 'chat';

  return null;
}
