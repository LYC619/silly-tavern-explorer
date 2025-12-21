import type { RegexRule, ChatMessage, PrefixMode, ChapterMarker } from '@/types/chat';

/**
 * 解析正则表达式字符串为 RegExp 对象
 */
export function parseRegex(regexStr: string): RegExp | null {
  if (!regexStr) return null;

  // 格式化为 /pattern/flags 格式
  const formatted = formatRegex(regexStr);
  
  // 解析 /pattern/flags 格式
  const match = /^\/(.*)\/([gimsuyd]*)$/.exec(formatted);
  
  if (match) {
    try {
      return new RegExp(match[1], match[2]);
    } catch (e) {
      console.error('Invalid regex:', regexStr, e);
      return null;
    }
  }
  
  return null;
}

/**
 * 格式化正则表达式为统一的 /pattern/flags 格式
 */
export function formatRegex(regexStr: string): string {
  if (!regexStr) return '';

  // 检查是否已经是 /pattern/flags 格式
  const match = /^\/(.*)\/([gimsuyd]*)$/.exec(regexStr);

  if (match) {
    return regexStr;
  } else {
    // 纯 pattern 格式，添加 /gs 标志
    return `/${regexStr}/gs`;
  }
}

/**
 * 应用正则规则到消息内容
 */
export function applyRegexRules(
  content: string,
  rules: RegexRule[],
  isUser: boolean
): string {
  let result = content;

  for (const rule of rules) {
    if (rule.disabled) continue;

    // 检查规则是否应用于当前消息类型
    const shouldApply =
      rule.placement.length === 0 ||
      rule.placement.includes('all') ||
      (isUser && rule.placement.includes('user')) ||
      (!isUser && rule.placement.includes('assistant'));

    if (!shouldApply) continue;

    const regex = parseRegex(rule.findRegex);
    if (regex) {
      result = result.replace(regex, rule.replaceString);
    }
  }

  return result;
}

/**
 * 获取消息前缀
 */
export function getMessagePrefix(
  message: ChatMessage,
  prefixMode: PrefixMode
): string {
  const isUser = message.role === 'user' || message.is_user;

  switch (prefixMode) {
    case 'name':
      return message.name || (isUser ? 'User' : 'Assistant');
    case 'human-assistant':
      return isUser ? 'Human' : 'Assistant';
    case 'user-model':
      return isUser ? 'user' : 'model';
    case 'none':
      return '';
    default:
      return message.name || (isUser ? 'User' : 'Assistant');
  }
}

/**
 * 格式化章节标记为 Markdown 格式
 */
function formatChapterMarker(marker: ChapterMarker): string {
  const lines: string[] = [];
  
  // 卷名作为三级标题
  if (marker.volume) {
    lines.push(`### ${marker.volume}`);
    lines.push('');
  }
  
  // 章节名作为四级标题
  lines.push(`#### ${marker.title}`);
  lines.push('');
  
  // 章节概要用引用格式
  if (marker.summary) {
    const summaryLines = marker.summary.split('\n');
    for (const line of summaryLines) {
      lines.push(`> ${line}`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * 将消息转换为 TXT 格式
 */
export function convertMessagesToTxt(
  messages: ChatMessage[],
  rules: RegexRule[],
  prefixMode: PrefixMode,
  markers: ChapterMarker[] = []
): string {
  const lines: string[] = [];
  
  // 创建消息索引到标记的映射
  const markerMap = new Map<number, ChapterMarker>();
  for (const marker of markers) {
    markerMap.set(marker.messageIndex, marker);
  }

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const isUser = message.role === 'user' || message.is_user;
    
    // 检查是否有章节标记
    const marker = markerMap.get(i);
    if (marker) {
      lines.push(formatChapterMarker(marker));
    }
    
    // 应用正则规则
    let content = applyRegexRules(message.content, rules, isUser);
    
    // 跳过空内容
    if (!content.trim()) continue;

    // 获取前缀
    const prefix = getMessagePrefix(message, prefixMode);

    // 格式化消息
    if (prefixMode === 'none') {
      lines.push(content);
    } else {
      lines.push(`${prefix}: ${content}`);
    }
  }

  // 使用双换行分隔消息，保留段落格式
  return lines.join('\n\n');
}
