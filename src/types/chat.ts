// SillyTavern 原始消息格式
export interface STRawMessage {
  name?: string;
  is_user?: boolean;
  is_system?: boolean;
  send_date?: string | number;
  mes?: string;
  extra?: Record<string, any>;
  title?: string;
  gen_started?: string;
  gen_finished?: string;
  swipe_id?: number;
  swipes?: string[];
  swipe_info?: any[];
  force_avatar?: string;
  [key: string]: any; // 保留其他未知字段
}

// SillyTavern JSONL 第一行的元数据
export interface STMetadata {
  user_name?: string;
  character_name?: string;
  create_date?: string;
  chat_metadata?: Record<string, any>;
  [key: string]: any;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  name?: string;
  timestamp?: number;
  is_user?: boolean;
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
}

// 内置正则规则
export const DEFAULT_REGEX_RULES: RegexRule[] = [
  {
    id: 'builtin-thinking',
    name: '移除思维链',
    findRegex: '<think(ing)?>[\\s\\S]*?</think(ing)?>(\\n)?',
    replaceString: '',
    placement: ['all'],
    disabled: false,
  },
  {
    id: 'builtin-theatre',
    name: '移除Theatre标签',
    findRegex: '<theatre>[\\s\\S]*?</theatre>(\\n)?',
    replaceString: '',
    placement: ['all'],
    disabled: false,
  },
  {
    id: 'builtin-status',
    name: '移除状态栏',
    findRegex: '<status(blocks?)?>[\\s\\S]*?</status(blocks?)?>',
    replaceString: '',
    placement: ['all'],
    disabled: false,
  },
  {
    id: 'builtin-summary',
    name: '移除摘要/总结',
    findRegex: '(<details><summary>[\\s\\S]*?</details>)|(<This_round_events>[\\s\\S]*?</This_round_events>)|(<[Aa]bstract>[\\s\\S]*?</[Aa]bstract>)',
    replaceString: '',
    placement: ['all'],
    disabled: false,
  },
  {
    id: 'builtin-disclaimer',
    name: '移除免责声明',
    findRegex: '<disclaimer>[\\s\\S]*?</disclaimer>',
    replaceString: '',
    placement: ['all'],
    disabled: false,
  },
  {
    id: 'builtin-comments',
    name: '移除HTML注释',
    findRegex: '<!-- [\\s\\S]*? -->(\\n)?',
    replaceString: '',
    placement: ['all'],
    disabled: true,
  },
];
