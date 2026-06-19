import type { RegexRule, ChatMessage, PrefixMode, ChapterMarker } from '@/types/chat';

const regexCache = new Map<string, RegExp | null>();

/**
 * 解析正则表达式字符串为 RegExp 对象（带缓存）
 * 直接缓存编译好的 RegExp 实例，避免每条消息、每条规则都重新 new RegExp。
 * String.prototype.replace 对带 g 的正则每次从头匹配并重置 lastIndex，复用实例是安全的。
 */
export function parseRegex(regexStr: string): RegExp | null {
  if (!regexStr) return null;

  if (regexCache.has(regexStr)) {
    return regexCache.get(regexStr)!;
  }

  const formatted = formatRegex(regexStr);
  const compiled = compileRegex(formatted);
  regexCache.set(regexStr, compiled);
  return compiled;
}

function compileRegex(formatted: string): RegExp | null {
  // 从末尾向前找到最后一个未转义的 / 作为 flags 分隔符
  const lastSlash = findLastUnescapedSlash(formatted);
  if (formatted.startsWith('/') && lastSlash > 0) {
    const pattern = formatted.slice(1, lastSlash);
    const flags = formatted.slice(lastSlash + 1);
    if (/^[gimsuyd]*$/.test(flags)) {
      try {
        return new RegExp(pattern, flags);
      } catch (e) {
        console.error('Invalid regex:', formatted, e);
        return null;
      }
    }
  }
  return null;
}

function findLastUnescapedSlash(str: string): number {
  for (let i = str.length - 1; i > 0; i--) {
    if (str[i] === '/') {
      let backslashes = 0;
      for (let j = i - 1; j >= 0 && str[j] === '\\'; j--) {
        backslashes++;
      }
      if (backslashes % 2 === 0) return i;
    }
  }
  return -1;
}

/**
 * 格式化正则表达式为统一的 /pattern/flags 格式
 */
export function formatRegex(regexStr: string): string {
  if (!regexStr) return '';

  if (regexStr.startsWith('/')) {
    const lastSlash = findLastUnescapedSlash(regexStr);
    if (lastSlash > 0) {
      const flags = regexStr.slice(lastSlash + 1);
      if (/^[gimsuyd]*$/.test(flags)) {
        return regexStr;
      }
    }
  }

  // 纯 pattern 格式，添加 /gs 标志
  return `/${regexStr}/gs`;
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
