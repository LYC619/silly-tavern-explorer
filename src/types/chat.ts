// SillyTavern 原始消息格式
// 注：以下 any 是刻意的——ST 各版本/插件会往原始数据里塞未知字段，
// 必须原样保留才能无损导出回 ST，不能收紧类型或丢弃未知字段。
export interface STRawMessage {
  name?: string;
  is_user?: boolean;
  is_system?: boolean;
  send_date?: string | number;
  mes?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 保留 ST 插件扩展字段
  extra?: Record<string, any>;
  title?: string;
  gen_started?: string;
  gen_finished?: string;
  swipe_id?: number;
  swipes?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ST 各版本结构不一，原样保留
  swipe_info?: any[];
  force_avatar?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 保留其他未知字段用于无损导出
  [key: string]: any;
}

// SillyTavern JSONL 第一行的元数据
export interface STMetadata {
  user_name?: string;
  character_name?: string;
  create_date?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 保留 ST 未知元数据字段
  chat_metadata?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 保留其他未知字段用于无损导出
  [key: string]: any;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  name?: string;
  timestamp?: number;
  is_user?: boolean;
  /** ST「Hide message」把 is_system 置 true 持久化——这类有真实内容的隐藏楼层导入时保留并打此标记，UI 可切换显隐 */
  hidden?: boolean;
  rawData?: STRawMessage; // 保留原始数据用于导出
}

export interface ChapterMarker {
  messageId: string;
  messageIndex: number;
  title: string;
  volume?: string;
  summary?: string;
  createdAt: number;
}

export interface CharacterInfo {
  name: string;
  avatar?: string;
  color?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  character: CharacterInfo;
  user: CharacterInfo;
  createdAt: number;
  rawMetadata?: STMetadata; // 保留原始元数据用于导出
}

export type ThemeStyle = 'novel' | 'social' | 'minimal' | 'elegant';

export type PrefixMode = 'name' | 'human-assistant' | 'user-model' | 'none';

export interface RegexRule {
  id: string;
  name: string;
  findRegex: string;
  replaceString: string;
  placement: ('all' | 'user' | 'assistant')[];
  disabled: boolean;
  /** 从 ST 正则脚本导入时，保留 ST 独有字段(trimStrings/markdownOnly/substituteRegex 等)，导出时无损拼回 */
  _raw?: Record<string, unknown>;
}

export interface ExportSettings {
  theme: ThemeStyle;
  showTimestamp: boolean;
  showAvatar: boolean;
  paperWidth: number;
  fontSize: number;
  prefixMode: PrefixMode;
  regexRules: RegexRule[];
  cleanPluginCache: boolean;
  exportRange: 'all' | 'recent' | 'custom';
  recentCount: number;
  customStart: number;
  customEnd: number;
  fontFamily?: string;
}

// 内置正则规则（已清空：原内置规则已过时，用户改用「快速添加」自建规则）
export const DEFAULT_REGEX_RULES: RegexRule[] = [];
