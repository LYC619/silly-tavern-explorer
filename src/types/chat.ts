export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  name?: string;
  timestamp?: number;
  is_user?: boolean;
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
