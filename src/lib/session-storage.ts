import type { ChatSession, ExportSettings, ChapterMarker, RegexRule } from '@/types/chat';
import { DEFAULT_REGEX_RULES } from '@/types/chat';
import { getBook } from '@/lib/bookshelf-db';

const SESSION_KEY = 'st-beautifier-session';
const SETTINGS_KEY = 'st-beautifier-settings';
const MARKERS_KEY = 'st-beautifier-markers';
const CUSTOM_REGEX_KEY = 'st-beautifier-custom-regex';
const BUILTIN_STATES_KEY = 'st-beautifier-builtin-states';
const REGEX_PRESETS_KEY = 'st-beautifier-regex-presets';

/**
 * 跨页临时态。
 *
 * 历史教训：早期把整份 session（可能数十万字）直接 JSON 塞进 sessionStorage，
 * 而 sessionStorage 有约 5MB 的硬上限——稍大的聊天记录就会写入失败、切页即丢，
 * 且配额按 origin 隔离（localhost 各端口、线上域名互不相通），表现飘忽难复现。
 *
 * 现改为：session 本体只存于 IndexedDB（几乎无限），这里只存「指针 + 轻量临时态」。
 * 切回聊天页时凭 currentBookId 从 IndexedDB 读回 session，再用这里的 markers/favorites
 * 覆盖（它们是用户最近一次未必已「保存到书架」的编辑态）。
 */
export interface SessionPointer {
  currentBookId: string | null;
  markers: ChapterMarker[];
  /** 收藏的楼层（存 messageId，轻量个人书签，不进导出，区别于会进 TXT 标题的章节标记） */
  favorites?: string[];
}

// Session storage (临时，页面间导航)
// 只存轻量指针，永远不会触及 5MB 配额，故不再需要返回成功与否。
export function saveSessionPointer(pointer: SessionPointer): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(pointer));
  } catch (e) {
    // 指针极小，正常不会失败；万一失败也只是跨页丢临时态，不影响 IndexedDB 里的数据
    console.error('Failed to save session pointer:', e);
  }
}

export function loadSessionPointer(): SessionPointer | null {
  try {
    const data = sessionStorage.getItem(SESSION_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load session pointer:', e);
  }
  return null;
}

export function clearSessionState(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * 清空全部「临时缓存」：聊天页指针、世界书跨页态、AI 工具中转数据等，
 * 即整份 sessionStorage——它本就是页面间导航的临时态，按标签页隔离。
 * 不触及 IndexedDB（书架作品 / 世界书等永久数据）与 localStorage（设置 / 正则 / AI 配置）。
 * 供「设置」里出问题时给用户手动自救。
 */
export function clearAllTempCache(): void {
  try {
    sessionStorage.clear();
  } catch (e) {
    console.error('Failed to clear temp cache:', e);
  }
}

/**
 * 读回「当前活跃的聊天记录」session 本体。
 * session 已不再存于 sessionStorage（见 SessionPointer 注释），故凭指针里的 currentBookId
 * 从 IndexedDB 取回。供 AI 工具等需要读当前聊天内容的页面使用。
 * 无活跃记录（无指针 / 无 bookId / book 已删）时返回 null。
 */
export async function loadActiveSession(): Promise<ChatSession | null> {
  const pointer = loadSessionPointer();
  if (!pointer?.currentBookId) return null;
  try {
    const book = await getBook(pointer.currentBookId);
    return book?.session ?? null;
  } catch (e) {
    console.error('Failed to load active session:', e);
    return null;
  }
}

// Custom regex rules (持久化到 localStorage)
export function saveCustomRegexRules(rules: RegexRule[]): void {
  try {
    // 只保存非内置规则
    const customRules = rules.filter(r => !r.id.startsWith('builtin-'));
    localStorage.setItem(CUSTOM_REGEX_KEY, JSON.stringify(customRules));
  } catch (e) {
    console.error('Failed to save custom regex rules:', e);
  }
}

export function loadCustomRegexRules(): RegexRule[] {
  try {
    const data = localStorage.getItem(CUSTOM_REGEX_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load custom regex rules:', e);
  }
  return [];
}

// 合并内置规则和自定义规则
export function getMergedRegexRules(): RegexRule[] {
  const customRules = loadCustomRegexRules();
  return [...DEFAULT_REGEX_RULES, ...customRules];
}

export function saveBuiltinRuleStates(rules: RegexRule[]): void {
  try {
    const states: Record<string, boolean> = {};
    rules
      .filter(r => r.id.startsWith('builtin-'))
      .forEach(r => {
        states[r.id] = r.disabled;
      });
    localStorage.setItem(BUILTIN_STATES_KEY, JSON.stringify(states));
  } catch (e) {
    console.error('Failed to save builtin rule states:', e);
  }
}

export function loadBuiltinRuleStates(): Record<string, boolean> {
  try {
    const data = localStorage.getItem(BUILTIN_STATES_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load builtin rule states:', e);
  }
  return {};
}

// 获取完整的规则列表（包含保存的状态）
export function getInitialRegexRules(): RegexRule[] {
  const builtinStates = loadBuiltinRuleStates();
  const customRules = loadCustomRegexRules();
  
  const builtinRules = DEFAULT_REGEX_RULES.map(rule => ({
    ...rule,
    disabled: builtinStates[rule.id] ?? rule.disabled,
  }));
  
  return [...builtinRules, ...customRules];
}

// 正则预设（规则集快照，持久化到 localStorage）
export interface RegexPreset {
  id: string;
  name: string;
  rules: RegexRule[];
  createdAt: number;
}

export function loadRegexPresets(): RegexPreset[] {
  try {
    const data = localStorage.getItem(REGEX_PRESETS_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load regex presets:', e);
  }
  return [];
}

export function saveRegexPresets(presets: RegexPreset[]): void {
  try {
    localStorage.setItem(REGEX_PRESETS_KEY, JSON.stringify(presets));
  } catch (e) {
    console.error('Failed to save regex presets:', e);
  }
}

// 保存当前规则集为一个新预设，返回更新后的预设列表
export function addRegexPreset(name: string, rules: RegexRule[]): RegexPreset[] {
  const presets = loadRegexPresets();
  const preset: RegexPreset = {
    id: crypto.randomUUID(),
    name,
    rules: JSON.parse(JSON.stringify(rules)),
    createdAt: Date.now(),
  };
  const updated = [...presets, preset];
  saveRegexPresets(updated);
  return updated;
}

export function deleteRegexPreset(id: string): RegexPreset[] {
  const updated = loadRegexPresets().filter(p => p.id !== id);
  saveRegexPresets(updated);
  return updated;
}

// 保存设置到 localStorage
export function saveSettings(settings: ExportSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

// 加载设置
export function loadSettings(): ExportSettings | null {
  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return null;
}
